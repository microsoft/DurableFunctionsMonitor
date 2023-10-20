// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using Microsoft.WindowsAzure.Storage.Table;
using Newtonsoft.Json.Linq;

namespace DurableFunctionsMonitor.DotNetBackend
{
    static class OrchestrationHistory
    {
        /// <summary>
        /// Fetches orchestration instance history directly from XXXHistory table
        /// Tries to mimic the history aggregation algorithm in https://github.com/Azure/azure-functions-durable-extension/blob/main/src/WebJobs.Extensions.DurableTask/ContextImplementations/DurableClient.cs
        /// Intentionally returns IEnumerable, because the consuming code not always iterates through all of it.
        /// </summary>
        public static async Task<IEnumerable<HistoryEvent>> GetHistoryDirectlyFromTable(IDurableClient durableClient, string connName, string hubName, string instanceId)
        {
            var tableClient = await TableClient.GetTableClient(connName);

            // Need to fetch executionId first

            var instanceEntity = (await tableClient.ExecuteAsync($"{hubName}Instances", TableOperation.Retrieve(instanceId, string.Empty)))
                .Result as DynamicTableEntity;

            string executionId = instanceEntity.Properties.ContainsKey("ExecutionId") ? 
                instanceEntity.Properties["ExecutionId"].StringValue : 
                null;

            var instanceIdFilter = TableQuery.CombineFilters
            (
                TableQuery.GenerateFilterCondition("PartitionKey", QueryComparisons.Equal, instanceId),
                TableOperators.And,
                TableQuery.GenerateFilterCondition("ExecutionId", QueryComparisons.Equal, executionId)
            );

            // Fetching _all_ correlated events with a separate parallel query. This seems to be the only option.
            var correlatedEventsQuery = new TableQuery<HistoryEntity>().Where
            (
                TableQuery.CombineFilters
                (
                    instanceIdFilter,
                    TableOperators.And,
                    TableQuery.GenerateFilterConditionForInt("TaskScheduledId", QueryComparisons.GreaterThanOrEqual, 0)
                )
            );

            var correlatedEventsTask = tableClient
                .GetAllAsync($"{hubName}History", correlatedEventsQuery)
                .ContinueWith(t => {

                    // It turned out that there can be entities with duplicated TaskScheduleId (not sure why).
                    // So creating this map manually (instead of using .ToDictionary())
                    var correlatedEventsMap = new Dictionary<int, HistoryEntity>();

                    foreach (var historyEntity in t.Result)
                    {
                        correlatedEventsMap[historyEntity.TaskScheduledId.Value] = historyEntity;
                    }

                    return correlatedEventsMap;
                });

            // Fetching the history
            var query = new TableQuery<HistoryEntity>().Where(instanceIdFilter);

            // Intentionally using synchronous method, since not all results might be iterated
            var queryResults = tableClient.GetAll($"{hubName}History", query);

            return EnumerateEvents(queryResults, correlatedEventsTask);
        }

        private static IEnumerable<HistoryEvent> EnumerateEvents(IEnumerable<HistoryEntity> events, Task<Dictionary<int, HistoryEntity>> correlatedEventsTask)
        {
            // Memorizing 'ExecutionStarted' event, to further correlate with 'ExecutionCompleted'
            HistoryEntity executionStartedEvent = null;

            foreach (var evt in events)
            {
                switch (evt.EventType)
                {
                    case "TaskScheduled":
                    case "SubOrchestrationInstanceCreated":

                        // Trying to match the completion event
                        correlatedEventsTask.Result.TryGetValue(evt.EventId, out var correlatedEvt);
                        if (correlatedEvt != null)
                        {
                            yield return correlatedEvt.ToHistoryEvent
                            (
                                evt._Timestamp,
                                evt.Name,
                                correlatedEvt.EventType == "GenericEvent" ? evt.EventType : null,
                                evt.InstanceId
                            );
                        }
                        else
                        {
                            yield return evt.ToHistoryEvent();
                        }

                        break;
                    case "ExecutionStarted":

                        executionStartedEvent = evt;

                        yield return evt.ToHistoryEvent(null, evt.Name);

                        break;
                    case "ExecutionCompleted":
                    case "ExecutionFailed":
                    case "ExecutionTerminated":

                        yield return evt.ToHistoryEvent(executionStartedEvent?._Timestamp);

                        break;
                    case "ContinueAsNew":
                    case "TimerCreated":
                    case "TimerFired":
                    case "EventRaised":
                    case "EventSent":

                        yield return evt.ToHistoryEvent();

                        break;
                }
            }
        }

        private static HistoryEvent ToHistoryEvent(this HistoryEntity evt, 
            DateTimeOffset? scheduledTime = null, 
            string functionName = null, 
            string eventType = null,
            string subOrchestrationId = null)
        {
            return new HistoryEvent
            {
                Timestamp = evt._Timestamp.ToUniversalTime(),
                EventType = eventType ?? evt.EventType,
                EventId = evt.TaskScheduledId,
                Name = string.IsNullOrEmpty(evt.Name) ? functionName : evt.Name,
                Result = evt.Result,
                Details = evt.Details,
                SubOrchestrationId = subOrchestrationId ?? evt.InstanceId,
                ScheduledTime = scheduledTime,
                DurationInMs = scheduledTime.HasValue ? (evt._Timestamp - scheduledTime.Value).TotalMilliseconds : 0
            };
        }

        internal static HistoryEvent ToHistoryEvent(JToken token)
        {
            dynamic dynamicToken = token;

            // Turned out that string.IsNullOrEmpty() can throw, if the passed dynamic value is not of a string type.
            // So need to explicitly convert to string first
            string name = dynamicToken.Name;
            if (string.IsNullOrEmpty(name))
            {
                name = dynamicToken.FunctionName;
            }

            return new HistoryEvent
            {
                Timestamp = dynamicToken.Timestamp,
                EventType = dynamicToken.EventType,
                EventId = dynamicToken.EventId,
                Name = name,
                ScheduledTime = dynamicToken.ScheduledTime,
                Result = dynamicToken.Result?.ToString(),
                Details = dynamicToken.Details?.ToString(),
                DurationInMs = dynamicToken.DurationInMs,
                SubOrchestrationId = dynamicToken.SubOrchestrationId
            };
        }

        internal static IEnumerable<HistoryEvent> ApplyTimeFrom(this IEnumerable<HistoryEvent> events, DateTime? timeFrom)
        {
            if (timeFrom == null)
            {
                return events;
            }

            return events.Where(evt => evt.Timestamp >= timeFrom);
        }
    }

    /// <summary>
    /// Represents a record in orchestration's history
    /// </summary>
    public class HistoryEvent
    {
        public DateTimeOffset Timestamp { get; set; }
        public string EventType { get; set; }
        public int? EventId { get; set; }
        public string Name { get; set; }
        public DateTimeOffset? ScheduledTime { get; set; }
        public string Result { get; set; }
        public string Details { get; set; }
        public double? DurationInMs { get; set; }
        public string SubOrchestrationId { get; set; }
    }

    // Represents an record in XXXHistory table
    class HistoryEntity : TableEntity
    {
        public string InstanceId { get; set; }
        public string EventType { get; set; }
        public string Name { get; set; }
        public DateTimeOffset _Timestamp { get; set; }
        public string Result { get; set; }
        public string Details { get; set; }
        public int EventId { get; set; }
        public int? TaskScheduledId { get; set; }
    }
}
