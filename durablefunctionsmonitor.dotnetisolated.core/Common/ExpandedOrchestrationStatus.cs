// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.DurableTask.Client;
using Microsoft.DurableTask.Client.Entities;
using Microsoft.DurableTask.Entities;
using Newtonsoft.Json;
using System.Text.RegularExpressions;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    enum EntityTypeEnum
    {
        Orchestration = 0,
        DurableEntity
    }

    struct EntityId
    {
        public EntityId(string name, string key) 
        {
            this.EntityName = name;
            this.EntityKey = key;
        }

        [JsonProperty(PropertyName = "name")]
        public string EntityName { get; set; }

        [JsonProperty(PropertyName = "key")]
        public string EntityKey { get; set; }
    }

    // Adds extra fields to DurableOrchestrationStatus returned by IDurableClient.ListInstancesAsync()
    class ExpandedOrchestrationStatus : DurableOrchestrationStatus
    {
        public static readonly Regex EntityIdRegex = new Regex(@"@([\w-]+)@(.+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        public EntityTypeEnum EntityType { get; private set; }
        public EntityId? EntityId { get; private set; }
        public double Duration { get; private set; }

        public string ParentInstanceId
        {
            get
            {
                if (this._parentInstanceIdTask == null)
                {
                    return string.Empty;
                }

                if (this._parentInstanceId != null)
                {
                    return this._parentInstanceId;
                }

                this._parentInstanceId = string.Empty;
                try
                {
                    this._parentInstanceId = this._parentInstanceIdTask.Result;
                }
                catch(Exception)
                {
                    // Intentionally doing nothing. Also it's not possible to log anything here at this stage.
                }

                return this._parentInstanceId;
            }
        }

        public ExpandedOrchestrationStatus(DurableOrchestrationStatus that,
            Task<string> parentInstanceIdTask,
            HashSet<string> hiddenColumns)
        {
            this.Name = that.Name;
            this.InstanceId = that.InstanceId;
            this.CreatedTime = that.CreatedTime;
            this.LastUpdatedTime = that.LastUpdatedTime;
            this.Duration = Math.Round((that.LastUpdatedTime - that.CreatedTime).TotalMilliseconds);
            this.RuntimeStatus = that.RuntimeStatus;

            this.Input = hiddenColumns.Contains("input") ? null : that.Input;
            this.Output = hiddenColumns.Contains("output") ? null : that.Output;
            this.CustomStatus = hiddenColumns.Contains("customStatus") ? null : that.CustomStatus;

            // Detecting whether it is an Orchestration or a Durable Entity
            if (TryGetEntityId(this.InstanceId, out var entityId))
            {
                this.EntityType = EntityTypeEnum.DurableEntity;
                this.EntityId = entityId;
            }

            this._parentInstanceIdTask = parentInstanceIdTask;
        }

        public ExpandedOrchestrationStatus(EntityMetadata that, HashSet<string> hiddenColumns) 
        {
            this.Name = that.Id.ToString();
            this.InstanceId = that.Id.ToString();
            this.CreatedTime = that.LastModifiedTime.UtcDateTime;
            this.LastUpdatedTime = that.LastModifiedTime.UtcDateTime;
            this.RuntimeStatus = OrchestrationRuntimeStatus.Running;

            this.EntityType = EntityTypeEnum.DurableEntity;
            this.EntityId = new EntityId(that.Id.Name, that.Id.Key);

            this.Input = (!that.IncludesState || hiddenColumns.Contains("input")) ? null : that.State.Value;
        }

        public static bool TryGetEntityId(string instanceId, out EntityId result)
        {
            var match = EntityIdRegex.Match(instanceId);
            if (match.Success)
            {
                result = new EntityId(match.Groups[1].Value, match.Groups[2].Value);
                return true;
            }

            result = default(EntityId);
            return false;
        }

        public static bool TryGetEntityInstanceId(string instanceId, out EntityInstanceId result)
        {
            var match = EntityIdRegex.Match(instanceId);
            if (match.Success)
            {
                result = new EntityInstanceId(match.Groups[1].Value, match.Groups[2].Value);
                return true;
            }

            result = default(EntityInstanceId);
            return false;
        }

        internal string GetEntityTypeName()
        {
            return this.EntityType == EntityTypeEnum.DurableEntity ? this.EntityId.Value.EntityName : this.Name;
        }

        private Task<string> _parentInstanceIdTask;
        private string _parentInstanceId;
    }
}