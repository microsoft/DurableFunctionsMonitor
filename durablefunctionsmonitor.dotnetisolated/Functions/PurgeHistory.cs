// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask.Client;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class PurgeHistory
    {
        // Request body
        class PurgeHistoryRequest
        {
            public string TimeFrom { get; set; }
            public string TimeTill { get; set; }
            public OrchestrationRuntimeStatus[] Statuses { get; set; }
            public EntityTypeEnum EntityType { get; set; }
        }

        // Purges orchestration instance history
        // POST /a/p/i/{connName}-{hubName}/purge-history
        [Function(nameof(DfmPurgeHistoryFunction))]
        [OperationKind(Kind = OperationKind.Write)]
        public async Task<HttpResponseData> DfmPurgeHistoryFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/purge-history")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName)
        {
            // Important to deserialize time fields as strings, because otherwise time zone will appear to be local
            var request = JsonConvert.DeserializeObject<PurgeHistoryRequest>(await req.ReadAsStringAsync());

            //TODO: try to implement purging for entities
            if (request.EntityType == EntityTypeEnum.DurableEntity)
            {
                return req.ReturnStatus(HttpStatusCode.BadRequest, "Purging entities is not supported in Isolated mode");
            }

            var result = await durableClient.PurgeAllInstancesAsync(new PurgeInstancesFilter(DateTimeOffset.Parse(request.TimeFrom), DateTime.Parse(request.TimeTill), request.Statuses));

            return await req.ReturnJson(result);
        }
    }
}
