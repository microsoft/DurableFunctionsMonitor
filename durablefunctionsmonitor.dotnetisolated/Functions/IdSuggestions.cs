// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask.Client;
using Microsoft.Azure.Functions.Worker.Http;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class IdSuggestions : DfmFunctionBase
    {
        public IdSuggestions(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints) : base(dfmSettings, extensionPoints) { }

        // Returns a list of orchestration/entity IDs, that start with some prefix
        // GET /a/p/i/{connName}-{hubName}/id-suggestions(prefix='{prefix}')
        [Function(nameof(DfmGetIdSuggestionsFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetIdSuggestionsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/id-suggestions(prefix='{prefix}')")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName,
            string prefix)
        {
            var instances = durableClient.GetAllInstancesAsync(new OrchestrationQuery
                {
                    InstanceIdPrefix = prefix,
                    PageSize = 50,
                    FetchInputsAndOutputs = false
                })
                .ToBlockingEnumerable();

            var orchestrationIds = instances.Select((s) => s.InstanceId);

            return await req.ReturnJson(orchestrationIds, Globals.FixUndefinedsInJson);
        }
    }
}
