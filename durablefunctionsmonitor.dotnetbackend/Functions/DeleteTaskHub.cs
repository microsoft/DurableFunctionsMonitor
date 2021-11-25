using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using DurableTask.AzureStorage;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class DeleteTaskHub: HttpHandlerBase
    {
        public DeleteTaskHub(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Deletes all underlying storage resources for a Task Hub.
        // POST /{connName}-{hubName}/a/p/i/delete-task-hub
        [FunctionName(nameof(DfmDeleteTaskHubFunction))]
        public Task<IActionResult> DfmDeleteTaskHubFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/delete-task-hub")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            ILogger log
        )
        {
            return this.HandleAuthAndErrors(defaultDurableClient, req, connName, hubName, log, async (_) => {

                // Checking that we're not in ReadOnly mode
                if (DfmEndpoint.Settings.Mode == DfmMode.ReadOnly)
                {
                    log.LogError("Endpoint is in ReadOnly mode");
                    return new StatusCodeResult(403);
                }

                string connectionString = Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName));

                var orcService = new AzureStorageOrchestrationService(new AzureStorageOrchestrationServiceSettings
                {
                    StorageConnectionString = connectionString,
                    TaskHubName = hubName,
                });

                // .DeleteAsync() tends to throw "The requested operation cannot be performed on this container because of a concurrent operation"
                // (though still seems to do its job). So just wrapping with try-catch
                try
                {
                    await orcService.DeleteAsync();
                }
                catch(Exception ex)
                {
                    log.LogError(ex, "AzureStorageOrchestrationService.DeleteAsync() failed");
                }

                return new OkResult();
            });
        }
    }
}