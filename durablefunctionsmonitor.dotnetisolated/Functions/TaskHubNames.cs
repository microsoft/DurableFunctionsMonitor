// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public static class TaskHubNames
    {
        // Returns all Task Hub names from the current Storage
        // GET /a/p/i/task-hub-names
        [Function(nameof(DfmGetTaskHubNamesFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public static async Task<HttpResponseData> DfmGetTaskHubNamesFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "a/p/i/task-hub-names")] HttpRequestData req
        )
        {
            IEnumerable<string> hubNames;

            string dfmNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            if (!string.IsNullOrEmpty(dfmNonce))
            {
                // For VsCode loading Task Hubs directly and without validation
                hubNames = await DfmEndpoint.ExtensionPoints.GetTaskHubNamesRoutine(EnvVariableNames.AzureWebJobsStorage);
            }
            else
            {
                // Otherwise applying all the filters
                hubNames = await Auth.GetAllowedTaskHubNamesAsync();
            }

            if (hubNames == null)
            {
                var errorResponse = req.CreateResponse(HttpStatusCode.InternalServerError);
                errorResponse.WriteString("Failed to load the list of Task Hubs");
                return errorResponse;
            }

            return await req.ReturnJson(hubNames);
        }
    }
}