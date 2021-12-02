// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using System;
using Microsoft.WindowsAzure.Storage;
using System.IO;
using Newtonsoft.Json;
using System.IO.Compression;

namespace DurableFunctionsMonitor.DotNetBackend
{
    // Adds extra fields to DurableOrchestrationStatus returned by IDurableClient.GetStatusAsync()
    class DetailedOrchestrationStatus : DurableOrchestrationStatus
    {
        public EntityTypeEnum EntityType { get; private set; }
        public EntityId? EntityId { get; private set; }

        public List<string> TabTemplateNames
        {
            get
            {
                // The underlying Task never throws, so it's OK.
                var templatesMap = CustomTemplates.GetTabTemplatesAsync().Result;
                return templatesMap.GetTemplateNames(this.GetEntityTypeName());
            }
        }

        public DetailedOrchestrationStatus(DurableOrchestrationStatus that, string connName)
        {
            this.Name = that.Name;
            this.InstanceId = that.InstanceId;
            this.CreatedTime = that.CreatedTime;
            this.LastUpdatedTime = that.LastUpdatedTime;
            this.RuntimeStatus = that.RuntimeStatus;
            this.Output = that.Output;
            this.CustomStatus = that.CustomStatus;
            this.History = that.History;

            // Detecting whether it is an Orchestration or a Durable Entity
            var match = ExpandedOrchestrationStatus.EntityIdRegex.Match(this.InstanceId);
            if (match.Success)
            {
                this.EntityType = EntityTypeEnum.DurableEntity;
                this.EntityId = new EntityId(match.Groups[1].Value, match.Groups[2].Value);
            }

            this.Input = this.ConvertInput(that.Input, connName);
        }

        internal string GetEntityTypeName()
        {
            return this.EntityType == EntityTypeEnum.DurableEntity ? this.EntityId.Value.EntityName : this.Name;
        }

        private JToken ConvertInput(JToken input, string connName)
        {
            if (this.EntityType != EntityTypeEnum.DurableEntity)
            {
                return input;
            }

            // Temp fix for https://github.com/Azure/azure-functions-durable-extension/issues/1786
            if (input.Type == JTokenType.String && input.ToString().ToLowerInvariant().StartsWith("https://"))
            {
                string connectionString = Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName));
                var blobClient = CloudStorageAccount.Parse(connectionString).CreateCloudBlobClient();
                var blob = blobClient.GetBlobReferenceFromServerAsync(new Uri(input.ToString())).Result;

                using (var stream = new MemoryStream())
                {
                    blob.DownloadToStreamAsync(stream).Wait();
                    stream.Position = 0;
                    using (var gzipStream = new GZipStream(stream, CompressionMode.Decompress))
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