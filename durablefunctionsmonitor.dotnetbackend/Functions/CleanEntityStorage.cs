// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;
using System.Threading;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class CleanEntityStorage: HttpHandlerBase
    {
        public CleanEntityStorage(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Request body
        class CleanEntityStorageRequest
        {
            public bool removeEmptyEntities { get; set; }
            public bool releaseOrphanedLocks { get; set; }
        }

        // Does garbage collection on Durable Entities
        // POST /a/p/i/{connName}-{hubName}/clean-entity-storage
        [FunctionName(nameof(DfmCleanEntityStorageFunction))]
        public Task<IActionResult> DfmCleanEntityStorageFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/clean-entity-storage")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            ILogger log)
        {
            return this.HandleAuthAndErrors(defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                // Checking that we're not in ReadOnly mode
                if (DfmEndpoint.Settings.Mode == DfmMode.ReadOnly)
                {
                    log.LogError("Endpoint is in ReadOnly mode");
                    return new StatusCodeResult(403);
                }

                var request = JsonConvert.DeserializeObject<CleanEntityStorageRequest>(await req.ReadAsStringAsync());

                var result = await durableClient.CleanEntityStorageAsync(request.removeEmptyEntities, request.releaseOrphanedLocks, CancellationToken.None);

                return result.ToJsonContentResult();
            });
        }
    }
}