// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Hosting;
using Microsoft.WindowsAzure.Storage.Table;

namespace DurableFunctionsMonitor.DotNetIsolated.Netherite
{
    /// <summary>
    /// Extension methods for configuring DfMon
    /// </summary>
    public static class ExtensionMethods
    {
        /// <summary>
        /// Name of the table Netherite keeps its partition records in
        /// </summary>
        private const string PartitionsTableName = "DurableTaskPartitions";

        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IFunctionsWorkerApplicationBuilder UseDurableFunctionsMonitorWithNetheriteDurability(
            this IFunctionsWorkerApplicationBuilder builder,
            Action<DfmSettings> optionsBuilder = null
        )
        {
            return builder.UseDurableFunctionsMonitor((settings, extPoints) =>
            {
                optionsBuilder?.Invoke(settings);

                // Netherite does not maintain the XXXInstances/XXXHistory tables the default routine
                // looks for, so Task Hub names have to be read from its own partitions table instead.
                extPoints.GetTaskHubNamesRoutine = GetTaskHubNames;
            });
        }

        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IHostBuilder UseDurableFunctionsMonitorWithNetheriteDurability(this IHostBuilder hostBuilder, Action<DfmSettings> optionsBuilder = null)
        {
            return hostBuilder.ConfigureFunctionsWorkerDefaults((HostBuilderContext builderContext, IFunctionsWorkerApplicationBuilder builder) =>
            {
                builder.UseDurableFunctionsMonitorWithNetheriteDurability(optionsBuilder);
            });
        }

        /// <summary>
        /// Custom routine for fetching Task Hub names
        /// </summary>
        public static async Task<IEnumerable<string>> GetTaskHubNames(string connName)
        {
            var tableClient = await TableClient.GetTableClient(connName);

            var partitions = await tableClient.GetAllAsync(PartitionsTableName, new TableQuery<TableEntity>());

            return partitions.Select(p => p.PartitionKey).Distinct();
        }
    }
}
