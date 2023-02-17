using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using DurableFunctionsMonitor.DotNetBackend;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Hosting;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;

[assembly: WebJobsStartup(typeof(Dfm.Netherite.Startup))]
namespace Dfm.Netherite
{
    public class Startup : IWebJobsStartup
    {
        public void Configure(IWebJobsBuilder builder)
        {
            DfmEndpoint.Setup(null, new DfmExtensionPoints 
            {
                GetTaskHubNamesRoutine = GetTaskHubNames
            });
        }

        /// <summary>
        /// Custom routine for fetching Task Hub names
        /// </summary>
        public static async Task<IEnumerable<string>> GetTaskHubNames(string connName)
        {
            string connectionString = Environment.GetEnvironmentVariable(connName);

            var tableClient = CloudStorageAccount.Parse(connectionString).CreateCloudTableClient();

            var table = tableClient.GetTableReference("DurableTaskPartitions");

            var query = new TableQuery<TableEntity>();

            var partitionKeys = new List<string>();
            TableContinuationToken token = null;
            do
            {
                var nextBatch = await table.ExecuteQuerySegmentedAsync(query, token);

                partitionKeys.AddRange(nextBatch.Results.Select(r => r.PartitionKey));
                token = nextBatch.ContinuationToken;
            }
            while (token != null);

            return partitionKeys.Distinct();
        }
    }
}
