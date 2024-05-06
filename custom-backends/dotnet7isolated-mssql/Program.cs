// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Hosting;
using DurableFunctionsMonitor.DotNetIsolated;
using Microsoft.Data.SqlClient;
using Microsoft.DurableTask.Client;

namespace Dfm.DotNetIsolatedMsSql
{
    internal class Program
    {
        private static readonly string ConnString;
        private static readonly string SchemaName = "dt";

        static Program() 
        {
            ConnString = Environment.GetEnvironmentVariable("DFM_SQL_CONNECTION_STRING")!;

            // Getting custom schema name passed to us by VsCode ext
            string? schemaName = Environment.GetEnvironmentVariable("AzureFunctionsJobHost__extensions__durableTask__storageProvider__schemaName");
            if (!string.IsNullOrEmpty(schemaName))
            {
                SchemaName = schemaName;
            }
        }

        private static void Main(string[] args)
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) =>
                {
                    workerAppBuilder.UseDurableFunctionsMonitor((settings, extPoints) =>
                    {
                        extPoints.GetInstanceHistoryRoutine = (client, connName, hubName, instanceId) => Task.FromResult(GetInstanceHistory(client, connName, hubName, instanceId));
                        extPoints.GetParentInstanceIdRoutine = GetParentInstanceId;
                        extPoints.GetTaskHubNamesRoutine = GetTaskHubNames;
                    });
                })
                .Build();

            host.Run();
        }

        /// <summary>
        /// Custom routine for fetching Task Hub names
        /// </summary>
        public static async Task<IEnumerable<string>> GetTaskHubNames(string connName)
        {
            var result = new List<string>();

            string sql =
                $@"SELECT DISTINCT
                    i.TaskHub as TaskHub
                FROM
                    [{SchemaName}].Instances i";

            using (var conn = new SqlConnection(ConnString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (await reader.ReadAsync())
                        {
                            result.Add(reader["TaskHub"].ToString()!);
                        }
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Custom routine for fetching parent orchestration id
        /// </summary>
        public static async Task<string?> GetParentInstanceId(DurableTaskClient durableClient, string connName, string hubName, string instanceId)
        {
            string sql =
                $@"SELECT 
                    i.ParentInstanceID as ParentInstanceID
                FROM
                    [{SchemaName}].Instances i
                WHERE
                    i.InstanceID = @OrchestrationInstanceId AND i.TaskHub = @TaskHub";

            using (var conn = new SqlConnection(ConnString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@OrchestrationInstanceId", instanceId);
                    cmd.Parameters.AddWithValue("@TaskHub", hubName);
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (await reader.ReadAsync())
                        {
                            var parentInstanceId = reader["ParentInstanceID"];
                            if (parentInstanceId != null)
                            {
                                string? parentInstanceIdString = parentInstanceId.ToString();
                                if (!string.IsNullOrWhiteSpace(parentInstanceIdString))
                                {
                                    return parentInstanceIdString;
                                }
                            }
                        }
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// Custom routine for fetching orchestration history
        /// </summary>
        public static IEnumerable<HistoryEvent> GetInstanceHistory(DurableTaskClient durableClient, string connName, string hubName, string instanceId)
        {
            string sql =
                $@"SELECT 
                    IIF(h2.TaskID IS NULL, h.Timestamp, h2.Timestamp) as Timestamp, 
                    IIF(h2.TaskID IS NULL, h.EventType, h2.EventType) as EventType,
                    h.TaskID as EventId,
                    h.Name as Name,
                    IIF(h2.TaskID IS NULL, NULL, h.Timestamp) as ScheduledTime,
                    p1.Text as Input,
                    p2.Text as Result,
                    p2.Reason as Details,
                    cih.InstanceID as SubOrchestrationId
                FROM
                    [{SchemaName}].History h
                    LEFT JOIN
                    [{SchemaName}].History h2
                    ON
                    (
                        h.EventType IN ('TaskScheduled', 'SubOrchestrationInstanceCreated')
                        AND
                        h2.EventType IN ('SubOrchestrationInstanceCompleted', 'SubOrchestrationInstanceFailed', 'TaskCompleted', 'TaskFailed')
                        AND
                        h.InstanceID = h2.InstanceID AND h.ExecutionID = h2.ExecutionID AND h.TaskHub = h2.TaskHub AND h.TaskID = h2.TaskID AND h.SequenceNumber != h2.SequenceNumber
                    )
                    LEFT JOIN
                    [{SchemaName}].Payloads p1
                    ON
                    p1.PayloadID = h.DataPayloadID AND p1.TaskHub = h.TaskHub AND p1.InstanceID = h.InstanceID
                    LEFT JOIN
                    [{SchemaName}].Payloads p2
                    ON
                    p2.PayloadID = h2.DataPayloadID AND p2.TaskHub = h2.TaskHub AND p2.InstanceID = h2.InstanceID
                    LEFT JOIN
                    (
                        select 
                            cii.ParentInstanceID,
                            cii.InstanceID,
                            cii.TaskHub,
                            chh.TaskID
                        from 
                            [{SchemaName}].Instances cii
                            INNER JOIN
                            [{SchemaName}].History chh
                            ON
                            (chh.InstanceID = cii.InstanceID AND chh.TaskHub = cii.TaskHub AND chh.EventType = 'ExecutionStarted')
                    ) cih
                    ON
                    (cih.ParentInstanceID = h.InstanceID AND cih.TaskHub = h.TaskHub AND cih.TaskID = h.TaskID AND h.EventType = 'SubOrchestrationInstanceCreated')
                WHERE
                    h.EventType IN 
                    (
                        'ExecutionStarted', 'ExecutionCompleted', 'ExecutionFailed', 'ExecutionTerminated', 'TaskScheduled', 'SubOrchestrationInstanceCreated',
                        'ContinueAsNew', 'TimerCreated', 'TimerFired', 'EventRaised', 'EventSent'
                    )
                    AND
                    h.InstanceID = @OrchestrationInstanceId AND h.TaskHub = @TaskHub
                ORDER BY
                    h.SequenceNumber";


            using (var conn = new SqlConnection(ConnString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@OrchestrationInstanceId", instanceId);
                    cmd.Parameters.AddWithValue("@TaskHub", hubName);
                    using (var reader = cmd.ExecuteReader())
                    {
                        // Memorizing 'ExecutionStarted' event, to further correlate with 'ExecutionCompleted'
                        DateTimeOffset? executionStartedTimestamp = null;

                        while (reader.Read())
                        {
                            var evt = ToHistoryEvent(reader, executionStartedTimestamp);

                            if (evt.EventType == "ExecutionStarted")
                            {
                                executionStartedTimestamp = evt.Timestamp;
                            }

                            yield return evt;
                        }
                    }
                }
            }
        }

        private static HistoryEvent ToHistoryEvent(SqlDataReader reader, DateTimeOffset? executionStartTime)
        {
            var evt = new HistoryEvent
            {
                Timestamp = ((DateTime)reader["Timestamp"]).ToUniversalTime(),
                EventType = reader["EventType"].ToString(),
                EventId = reader["EventId"] is DBNull ? null : (int?)reader["EventId"],
                Name = reader["Name"].ToString(),
                Result = reader["Result"].ToString(),
                Details = reader["Details"].ToString(),
                SubOrchestrationId = reader["SubOrchestrationId"].ToString(),
            };

            var rawScheduledTime = reader["ScheduledTime"];
            if (!(rawScheduledTime is DBNull))
            {
                evt.ScheduledTime = ((DateTime)rawScheduledTime).ToUniversalTime();
            }
            else if (evt.EventType == "ExecutionCompleted")
            {
                evt.ScheduledTime = executionStartTime?.ToUniversalTime();
            }

            if (evt.ScheduledTime.HasValue)
            {
                evt.DurationInMs = (evt.Timestamp - evt.ScheduledTime.Value).TotalMilliseconds;
            }

            return evt;
        }
    }
}

