// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.DurableTask.Client;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// A set of extension points that can be customized by the client code, when DFM is used in 'injected' mode.
    /// </summary>
    public class DfmExtensionPoints
    {
        /// <summary>
        /// Routine for fetching orchestration history.
        /// Takes IDurableClient, connString env variable name, taskHubName and instanceId and returns IEnumerable[HistoryEvent].
        /// Provide your own implementation for a custom storage provider.
        /// Default implementation fetches history directly from XXXHistory table.
        /// </summary>
        public Func<DurableTaskClient, string, string, string, Task<IEnumerable<HistoryEvent>>> GetInstanceHistoryRoutine { get; set; }

        /// <summary>
        /// Routine for getting parent orchestration's Id.
        /// Takes IDurableClient, connString env variable name, taskHubName and instanceId and returns
        /// Id of parent orchestration, or null if the given instance is not a suborchestration.
        /// Provide your own implementation for a custom storage provider.
        /// Default implementation matches ExecutionId field in XXXInstances table.
        /// </summary>
        public Func<DurableTaskClient, string, string, string, Task<string>> GetParentInstanceIdRoutine { get; set; }

        /// <summary>
        /// Routine for getting Task Hub names
        /// Takes connString env variable name and returns names of Task Hubs discovered there.
        /// Provide your own implementation for a custom storage provider.
        /// Default implementation traverses XXXInstances tables.
        /// </summary>
        public Func<string, Task<IEnumerable<string>>> GetTaskHubNamesRoutine { get; set; }

        public DfmExtensionPoints()
        {
            this.GetInstanceHistoryRoutine = OrchestrationHistory.GetHistoryDirectlyFromTable;
            this.GetParentInstanceIdRoutine = DetailedOrchestrationStatus.GetParentInstanceIdDirectlyFromTable;
            this.GetTaskHubNamesRoutine = Auth.GetTaskHubNamesFromStorage;
        }
    }
}