using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public static class FunctionMap
    {
        // Tries to fetch a Function Map for a given Task Hub. 
        // Function Maps are specially formatted JSON files, they come either from a predefined folder
        // in the Blob Storage, or from a custom local folder.
        // GET /{connName}-{hubName}/a/p/i/delete-task-hub
        [FunctionName(nameof(DfmGetFunctionMap))]
        public static Task<IActionResult> DfmGetFunctionMap(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/function-map")] HttpRequest req,
            string connName,
            string hubName,
            ILogger log
        )
        {
            return req.HandleAuthAndErrors(connName, hubName, log, async () => {

                // The underlying Task never throws, so it's OK.
                var functionMapsMap = await CustomTemplates.GetFunctionMapsAsync();

                var functionMapJson = functionMapsMap.GetFunctionMap(hubName);
                if(string.IsNullOrEmpty(functionMapJson))
                {
                    return new NotFoundObjectResult("No Function Map provided");
                }

                return new ContentResult()
                {
                    Content = functionMapJson,
                    ContentType = "application/json; charset=UTF-8"
                };
            });
        }
    }
}