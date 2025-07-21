// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json.Linq;
using Microsoft.WindowsAzure.Storage;
using Newtonsoft.Json;
using System.IO.Compression;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.WindowsAzure.Storage.Table;
using Microsoft.DurableTask.Client;
using Microsoft.DurableTask.Client.Entities;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    // Adds extra fields to DurableOrchestrationStatus returned by IDurableClient.GetStatusAsync()
    class DetailedOrchestrationStatus : DurableOrchestrationStatus
    {
        public EntityTypeEnum EntityType { get; private set; }
        public EntityId? EntityId { get; private set; }
        public string ParentInstanceId { get; private set; }

        public List<string> TabTemplateNames { get; private set; }

        public JArray History { get; internal set; }

        internal static DetailedOrchestrationStatus CreateFrom(EntityMetadata that)
        {
            return new DetailedOrchestrationStatus
            {
                Name = that.Id.ToString(),
                InstanceId = that.Id.ToString(),
                CreatedTime = that.LastModifiedTime.UtcDateTime,
                LastUpdatedTime = that.LastModifiedTime.UtcDateTime,
                RuntimeStatus = OrchestrationRuntimeStatus.Running,

                EntityType = EntityTypeEnum.DurableEntity,
                EntityId = new EntityId(that.Id.Name, that.Id.Key),

                Input = that.IncludesState ? ConvertInput(ToJToken(that.State.Value)) : null
            };            
        }

        internal static async Task<DetailedOrchestrationStatus> CreateFrom(
            DurableOrchestrationStatus that, 
            DurableTaskClient durableClient, 
            string connName, 
            string hubName, 
            ILogger log, 
            DfmSettings settings,
            DfmExtensionPoints extensionPoints)
        {
            var connEnvVariableName = Globals.GetFullConnectionStringEnvVariableName(connName);

            var result = new DetailedOrchestrationStatus();

            result.Name = that.Name;
            result.InstanceId = that.InstanceId;
            result.CreatedTime = that.CreatedTime;
            result.LastUpdatedTime = that.LastUpdatedTime;
            result.RuntimeStatus = that.RuntimeStatus;
            result.Output = that.Output;
            result.CustomStatus = that.CustomStatus;
            result.Input = that.Input;

            // Trying to get parent orchestrationId for this instance, if it is a subOrchestration
            try
            {
                result.ParentInstanceId = await extensionPoints.GetParentInstanceIdRoutine(durableClient, connEnvVariableName, hubName, result.InstanceId);
            }
            catch(Exception ex)
            {
                log.LogWarning(ex, "Failed to get parent instanceId");
            }

            // Initializing custom liquid template names
            // The underlying Task never throws, so it's OK.
            var templatesMap = await CustomTemplates.GetTabTemplatesAsync(settings);
            result.TabTemplateNames = templatesMap.GetTemplateNames(result.GetInstanceTypeName());

            return result;
        }

        private static int GetParentInstanceIdTimeoutInSeconds = 15;

        internal static async Task<string> GetParentInstanceIdDirectlyFromTable(DurableTaskClient durableClient, string connEnvVariableName, string hubName, string instanceId)
        {
            var tableClient = await TableClient.GetTableClient(connEnvVariableName);
            IEnumerable<TableEntity> tableResult;

            // Checking if instanceId looks like a suborchestration (old format)
            var match = SubOrchestrationIdRegex.Match(instanceId);
            if (match.Success)
            {
                string parentExecutionId = match.Groups[1].Value;

                var executionIdQuery = new TableQuery<TableEntity>().Where
                (
                    TableQuery.GenerateFilterCondition("ExecutionId", QueryComparisons.Equal, parentExecutionId)
                );

                tableResult = await tableClient.GetAllAsync($"{durableClient.Name}Instances", executionIdQuery);
            }
            else
            {
                // Trying history table instead (new format)
                // Need to narrow the scan operation by timestamp (because history tables grow large)

                var instanceEntity = (await tableClient.ExecuteAsync($"{durableClient.Name}Instances", TableOperation.Retrieve(instanceId, string.Empty)))
                    .Result as DynamicTableEntity;

                var createdTime = instanceEntity?.Properties["CreatedTime"].DateTimeOffsetValue;
                if (createdTime == null)
                {
                    return null;
                }

                var notBefore = createdTime.Value - TimeSpan.FromSeconds(5);
                var notAfter = createdTime.Value + TimeSpan.FromSeconds(5);

                var executionIdQuery = new TableQuery<TableEntity>().Where
                (
                    TableQuery.CombineFilters
                    (
                        TableQuery.CombineFilters
                        (
                            TableQuery.GenerateFilterConditionForDate("Timestamp", QueryComparisons.GreaterThan, notBefore),
                            TableOperators.And,
                            TableQuery.GenerateFilterConditionForDate("Timestamp", QueryComparisons.LessThan, notAfter)
                        ),
                        TableOperators.And,
                        TableQuery.GenerateFilterCondition("InstanceId", QueryComparisons.Equal, instanceId)
                    )
                );

                // This scan can still take long time, so we'll have to hard-limit it to a few seconds. TaskCancelledException will be handled by upper code.
                var cts = new CancellationTokenSource(TimeSpan.FromSeconds(GetParentInstanceIdTimeoutInSeconds));
                tableResult = await tableClient.GetAllAsync($"{durableClient.Name}History", executionIdQuery, cts.Token);
            }

            return tableResult.FirstOrDefault()?.PartitionKey;
        }

        private static readonly Regex SubOrchestrationIdRegex = new Regex(@"(.+):\d+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static JsonSerializerSettings InputSerializerSettings = new JsonSerializerSettings
        {
            DateParseHandling = DateParseHandling.None
        };

        private DetailedOrchestrationStatus() {}

        internal string GetInstanceTypeName()
        {
            return this.EntityType == EntityTypeEnum.DurableEntity ? this.EntityId.Value.EntityName : this.Name;
        }

        private static JToken ConvertInput(JToken input)
        {
            if (input.Type == JTokenType.String)
            {
                return input;
            }

            var stateToken = input["state"];
            if (stateToken == null || stateToken.Type != JTokenType.String)
            {
                return input;
            }

            var stateString = stateToken.Value<string>();
            if (!(stateString.StartsWith('{') && stateString.EndsWith('}')))
            {
                return input;
            }

            // Converting JSON string into JSON object
            input["state"] = (JToken)JsonConvert.DeserializeObject(stateString, InputSerializerSettings);
            return input;
        }
    }
}