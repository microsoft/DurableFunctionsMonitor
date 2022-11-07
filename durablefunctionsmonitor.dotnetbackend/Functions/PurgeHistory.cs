// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using DurableTask.Core;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using Microsoft.Extensions.Logging;
using System.Threading;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class PurgeHistory: HttpHandlerBase
    {
        public PurgeHistory(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Request body
        class PurgeHistoryRequest
        {
            public string TimeFrom { get; set; }
            public string TimeTill { get; set; }
            public OrchestrationStatus[] Statuses { get; set; }
            public EntityTypeEnum EntityType { get; set; }
        }

        // Purges orchestration instance history
        // POST /a/p/i/{connName}-{hubName}/purge-history
        [FunctionName(nameof(DfmPurgeHistoryFunction))]
        public Task<IActionResult> DfmPurgeHistoryFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/purge-history")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            ILogger log)
        {
            return this.HandleAuthAndErrors(defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                Auth.ThrowIfInReadOnlyMode(req.HttpContext.User);

                // Important to deserialize time fields as strings, because otherwise time zone will appear to be local
                var request = JsonConvert.DeserializeObject<PurgeHistoryRequest>(await req.ReadAsStringAsync());

                var result = request.EntityType == EntityTypeEnum.DurableEntity ?
                    await this.PurgeDurableEntitiesHistory(durableClient, DateTime.Parse(request.TimeFrom),
                        DateTime.Parse(request.TimeTill)) :
                    await this.PurgeOrchestrationsHistory(durableClient, DateTime.Parse(request.TimeFrom),
                        DateTime.Parse(request.TimeTill), request.Statuses);

                return result.ToJsonContentResult();
            });
        }

        private Task<PurgeHistoryResult> PurgeOrchestrationsHistory(
            IDurableClient durableClient, 
            DateTime timeFrom, 
            DateTime timeTill, 
            OrchestrationStatus[] statuses)
        {
            return durableClient.PurgeInstanceHistoryAsync(timeFrom, timeTill, statuses);
        }

        private async Task<PurgeHistoryResult> PurgeDurableEntitiesHistory(
            IDurableClient durableClient,
            DateTime timeFrom,
            DateTime timeTill)
        {
            var query = new EntityQuery
            {
                LastOperationFrom = timeFrom,
                LastOperationTo = timeTill
            };

            int instancesDeleted = 0;
            EntityQueryResult response = null;
            do
            {
                query.ContinuationToken = response == null ? null : response.ContinuationToken;

                response = durableClient.ListEntitiesAsync(query, CancellationToken.None).Result;
                foreach (var entity in response.Entities)
                {
                    await durableClient.PurgeInstanceHistoryAsync(entity.EntityId.ToString());
                    instancesDeleted++;
                }
            }
            while (!string.IsNullOrEmpty(response.ContinuationToken));

            return new PurgeHistoryResult(instancesDeleted);
        }
    }
}
