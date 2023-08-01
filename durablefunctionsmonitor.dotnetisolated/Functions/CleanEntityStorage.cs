// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask.Client;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class CleanEntityStorage
    {
        // Request body
        class CleanEntityStorageRequest
        {
            public bool removeEmptyEntities { get; set; }
            public bool releaseOrphanedLocks { get; set; }
        }

        // Does garbage collection on Durable Entities
        // POST /a/p/i/{connName}-{hubName}/clean-entity-storage
        [Function(nameof(DfmCleanEntityStorageFunction))]
        [OperationKind(Kind = OperationKind.Write)]
        public async Task<HttpResponseData> DfmCleanEntityStorageFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/clean-entity-storage")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName)
        {
            var request = JsonConvert.DeserializeObject<CleanEntityStorageRequest>(await req.ReadAsStringAsync());

            return req.ReturnStatus(HttpStatusCode.BadRequest, "Cleaning entity storage is not supported in Isolated mode");
        }
    }
}