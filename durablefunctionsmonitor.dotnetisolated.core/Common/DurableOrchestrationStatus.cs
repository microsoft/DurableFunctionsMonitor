// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json.Linq;
using Microsoft.DurableTask.Client;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    class DurableOrchestrationStatus
    {
        public string Name { get; set; }
        public string InstanceId { get; set; }
        public DateTime CreatedTime { get; set; }
        public DateTime LastUpdatedTime { get; set; }
        public JToken Input { get; set; }
        public JToken Output { get; set; }
        public OrchestrationRuntimeStatus RuntimeStatus { get; set; }
        public JToken CustomStatus { get; set; }

        public DurableOrchestrationStatus() {}

        public DurableOrchestrationStatus(OrchestrationMetadata data) 
        {
            this.InstanceId = data.InstanceId;
            this.Name = data.Name;
            this.CreatedTime = data.CreatedAt.UtcDateTime;
            this.LastUpdatedTime = data.LastUpdatedAt.UtcDateTime;
            this.Input = ToJToken(data.SerializedInput);
            this.Output = ToJToken(data.SerializedOutput);
            this.RuntimeStatus = data.RuntimeStatus;
            this.CustomStatus = ToJToken(data.SerializedCustomStatus);
        }

        protected static JToken ToJToken(string str)
        {
            if (str == null)
            {
                return string.Empty;
            }

            if (str.StartsWith('{') || str.StartsWith('['))
            {
                return JToken.Parse(str);
            }

            return str;
        }
    }
}