// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask.Client;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class DeleteTaskHub : DfmFunctionBase
    {
        public DeleteTaskHub(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints) : base(dfmSettings, extensionPoints) { }
        
        // Deletes all underlying storage resources for a Task Hub.
        // POST /{connName}-{hubName}/a/p/i/delete-task-hub
        [Function(nameof(DfmDeleteTaskHubFunction))]
        [OperationKind(Kind = OperationKind.Write)]
        public async Task<HttpResponseData> DfmDeleteTaskHubFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/delete-task-hub")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName)
        {
            string connectionString = Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName));

            return req.ReturnStatus(HttpStatusCode.BadRequest, "Deleting Task Hubs is not supported in Isolated mode");
        }
    }
}