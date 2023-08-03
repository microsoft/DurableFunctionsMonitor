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

namespace DurableFunctionsMonitor.DotNetIsolated
{
    // Adds extra fields to DurableOrchestrationStatus returned by IDurableClient.GetStatusAsync()
    class DetailedOrchestrationStatus : DurableOrchestrationStatus
    {
        public EntityTypeEnum EntityType { get; private set; }
        public EntityId? EntityId { get; private set; }
        public string ParentInstanceId { get; private set; }

        public List<string> TabTemplateNames { get; private set; }

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
                    result.ParentInstanceId = await extensionPoints.GetParentInstanceIdRoutine(durableClient, connEnvVariableName, hubName, result.InstanceId);
                }
                catch(Exception ex)
                {
                    log.LogWarning(ex, "Failed to get parent instanceId");
                }
            }

            result.Input = await result.ConvertInput(that.Input, connEnvVariableName);

            // Initializing custom liquid template names
            // The underlying Task never throws, so it's OK.
            var templatesMap = await CustomTemplates.GetTabTemplatesAsync(settings);
            result.TabTemplateNames = templatesMap.GetTemplateNames(result.GetEntityTypeName());

            return result;
        }

        internal static async Task<string> GetParentInstanceIdDirectlyFromTable(DurableTaskClient durableClient, string connEnvVariableName, string hubName, string instanceId)
        {
            // Checking if instanceId looks like a suborchestration
            var match = SubOrchestrationIdRegex.Match(instanceId);
            if (!match.Success)
            {
                return null;
            }

            string parentExecutionId = match.Groups[1].Value;

            var tableClient = await TableClient.GetTableClient(connEnvVariableName);
            string tableName = $"{durableClient.Name}Instances";

            var executionIdQuery = new TableQuery<TableEntity>().Where
            (
                TableQuery.GenerateFilterCondition("ExecutionId", QueryComparisons.Equal, parentExecutionId)
            );

            var tableResult = await tableClient.GetAllAsync<TableEntity>(tableName, executionIdQuery);

            var parentEntity = tableResult.SingleOrDefault();

            if (parentEntity == null)
            {
                return null;
            }

            return parentEntity.PartitionKey;
        }

        private static readonly Regex SubOrchestrationIdRegex = new Regex(@"(.+):\d+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private DetailedOrchestrationStatus() {}

        internal string GetEntityTypeName()
        {
            return this.EntityType == EntityTypeEnum.DurableEntity ? this.EntityId.Value.EntityName : this.Name;
        }

        private async Task<JToken> ConvertInput(JToken input, string connEnvVariableName)
        {
            if (this.EntityType != EntityTypeEnum.DurableEntity)
            {
                return input;
            }

            // Temp fix for https://github.com/Azure/azure-functions-durable-extension/issues/1786
            if (input.Type == JTokenType.String && input.ToString().ToLowerInvariant().StartsWith("https://"))
            {
                string connectionString = Environment.GetEnvironmentVariable(connEnvVariableName);
                var blobClient = CloudStorageAccount.Parse(connectionString).CreateCloudBlobClient();
                var blob = await blobClient.GetBlobReferenceFromServerAsync(new Uri(input.ToString()));

                using (var memoryStream = new MemoryStream())
                {
                    await blob.DownloadToStreamAsync(memoryStream);
                    memoryStream.Position = 0;
                    using (var gzipStream = new GZipStream(memoryStream, CompressionMode.Decompress))
                    using (var streamReader = new StreamReader(gzipStream))
                    using (var jsonTextReader = new JsonTextReader(streamReader))
                    {
                        input = JToken.ReadFrom(jsonTextReader);
                    }
                }
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
            input["state"] = JObject.Parse(stateString);
            return input;
        }
    }
}