using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Linq;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using System.Threading;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class IdSuggestions: HttpHandlerBase
    {
        public IdSuggestions(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Returns a list of orchestration/entity IDs, that start with some prefix
        // GET /a/p/i/{connName}-{hubName}/id-suggestions(prefix='{prefix}')
        [FunctionName(nameof(DfmGetIdSuggestionsFunction))]
        public Task<IActionResult> DfmGetIdSuggestionsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/id-suggestions(prefix='{prefix}')")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            string prefix,
            ILogger log)
        {
            return this.HandleAuthAndErrors(defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                var response = await durableClient.ListInstancesAsync(new OrchestrationStatusQueryCondition()
                    {
                        InstanceIdPrefix = prefix,
                        PageSize = 50,
                        ShowInput = false
                    }, 
                    CancellationToken.None);

                var orchestrationIds = response.DurableOrchestrationState.Select((s) => s.InstanceId);

                return orchestrationIds.ToJsonContentResult(Globals.FixUndefinedsInJson);
            });
        }
    }
}
