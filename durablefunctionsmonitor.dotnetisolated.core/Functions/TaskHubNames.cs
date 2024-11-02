// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class TaskHubNames : DfmFunctionBase
    {
        public TaskHubNames(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints) : base(dfmSettings, extensionPoints) { }
        
        // Returns all Task Hub names from the current Storage
        // GET /a/p/i/task-hub-names
        [Function(nameof(DfmGetTaskHubNamesFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetTaskHubNamesFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.DfMonRoutePrefix + "/a/p/i/task-hub-names")] HttpRequestData req
        )
        {
            IEnumerable<string> hubNames;

            string dfmNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            if (!string.IsNullOrEmpty(dfmNonce))
            {
                // For VsCode loading Task Hubs directly and without validation
                hubNames = await this.ExtensionPoints.GetTaskHubNamesRoutine(Globals.StorageConnStringEnvVarName);
            }
            else
            {
                // Otherwise applying all the filters
                hubNames = await Auth.GetAllowedTaskHubNamesAsync(this.ExtensionPoints);
            }

            if (hubNames == null)
            {
                var errorResponse = req.CreateResponse(HttpStatusCode.InternalServerError);
                await errorResponse.WriteStringAsync("Failed to load the list of Task Hubs");
                return errorResponse;
            }

            return await req.ReturnJson(hubNames);
        }
    }
}