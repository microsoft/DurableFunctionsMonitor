// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using System;
using System.Linq;
using Microsoft.WindowsAzure.Storage;
using System.IO;
using Newtonsoft.Json;
using System.IO.Compression;
using System.Threading.Tasks;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.WindowsAzure.Storage.Table;

namespace DurableFunctionsMonitor.DotNetBackend
{
    // Adds extra fields to DurableOrchestrationStatus returned by IDurableClient.GetStatusAsync()
    class DetailedOrchestrationStatus : DurableOrchestrationStatus
    {
        public EntityTypeEnum EntityType { get; private set; }
        public EntityId? EntityId { get; private set; }
        public string ParentInstanceId { get; private set; }

        public List<string> TabTemplateNames
        {
            get
            {
                // The underlying Task never throws, so it's OK.
                var templatesMap = CustomTemplates.GetTabTemplatesAsync().Result;
                return templatesMap.GetTemplateNames(this.GetEntityTypeName());
            }
        }

        internal static async Task<DetailedOrchestrationStatus> CreateFrom(DurableOrchestrationStatus that, IDurableClient durableClient, string connName, string hubName, ILogger log)
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
            result.History = that.History;

            // Detecting whether it is an Orchestration or a Durable Entity
            var match = ExpandedOrchestrationStatus.EntityIdRegex.Match(result.InstanceId);
            if (match.Success)
            {
                result.EntityType = EntityTypeEnum.DurableEntity;
                result.EntityId = new EntityId(match.Groups[1].Value, match.Groups[2].Value);
            }
            else
            {
                // Trying to get parent orchestrationId for this instance, if it is a subOrchestration
                try
                {
                    result.ParentInstanceId = await DfmEndpoint.ExtensionPoints.GetParentInstanceIdRoutine(durableClient, connEnvVariableName, hubName, result.InstanceId);
                }
                catch(Exception ex)
                {
                    log.LogWarning(ex, "Failed to get parent instanceId");
                }
            }

            if (result.EntityType == EntityTypeEnum.DurableEntity)
            {
                result.Input = ConvertInput(that.Input, connEnvVariableName);
            }
            else
            {
                result.Input = that.Input;
            }

            return result;
        }

        internal static async Task<string> GetParentInstanceIdDirectlyFromTable(IDurableClient durableClient, string connEnvVariableName, string hubName, string instanceId)
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

                tableResult = await tableClient.GetAllAsync($"{durableClient.TaskHubName}Instances", executionIdQuery);
            }
            else
            {
                // Trying history table instead (new format)

                var executionIdQuery = new TableQuery<TableEntity>().Where
                (
                    TableQuery.GenerateFilterCondition("InstanceId", QueryComparisons.Equal, instanceId)
                );

                tableResult = await tableClient.GetAllAsync($"{durableClient.TaskHubName}History", executionIdQuery);
            }

            return tableResult.FirstOrDefault()?.PartitionKey;
        }

        private static readonly Regex SubOrchestrationIdRegex = new Regex(@"(.+):\d+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static JsonSerializerSettings InputSerializerSettings = new JsonSerializerSettings
        {
            DateParseHandling = DateParseHandling.None
        };

        private DetailedOrchestrationStatus() {}

        internal string GetEntityTypeName()
        {
            return this.EntityType == EntityTypeEnum.DurableEntity ? this.EntityId.Value.EntityName : this.Name;
        }

        private static JToken ConvertInput(JToken input, string connEnvVariableName)
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