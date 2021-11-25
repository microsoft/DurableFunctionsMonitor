using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json.Linq;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public static class ManageConnection
    {
        // Gets/sets Storage Connection String and Hub Name
        // GET /a/p/i/{connName}-{hubName}/manage-connection
        // PUT /a/p/i/{connName}-{hubName}/manage-connection
        [FunctionName(nameof(DfmManageConnectionFunction))]
        public static Task<IActionResult> DfmManageConnectionFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", "put", Route = Globals.ApiRoutePrefix + "/manage-connection")] HttpRequest req,
            string connName,
            string hubName,
            ExecutionContext executionContext,
            ILogger log)
        {
            return req.HandleAuthAndErrors(connName, hubName, log, async () => {

                string localSettingsFileName = Path.Combine(executionContext.FunctionAppDirectory, "local.settings.json");

                if (req.Method == "GET")
                {
                    bool isRunningOnAzure = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME));
                    // Don't allow editing, when running in Azure or as a container
                    bool isReadOnly = isRunningOnAzure || !File.Exists(localSettingsFileName);

                    string connectionString = 
                        Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName)) ?? 
                        string.Empty;
                    
                    // No need for your accountKey to ever leave the server side
                    connectionString = AccountKeyRegex.Replace(connectionString, "AccountKey=*****");

                    return new { connectionString, hubName = hubName, isReadOnly }.ToJsonContentResult();
                }
                else
                {
                    // Checking that we're not in ReadOnly mode
                    if (DfmEndpoint.Settings.Mode == DfmMode.ReadOnly)
                    {
                        log.LogError("Endpoint is in ReadOnly mode");
                        return new StatusCodeResult(403);
                    }

                    dynamic bodyObject = JObject.Parse(await req.ReadAsStringAsync());

                    string connectionString = bodyObject.connectionString;

                    // local.settings.json file does should already exist
                    dynamic localSettings = JObject.Parse(await File.ReadAllTextAsync(localSettingsFileName));

                    localSettings.Merge(JObject.Parse("{Values: {}}"));
                    if (!string.IsNullOrEmpty(connectionString))
                    {
                        localSettings.Values.AzureWebJobsStorage = connectionString;
                    }

                    await File.WriteAllTextAsync(localSettingsFileName, localSettings.ToString());

                    return new OkResult();
                }
            });
        }

        private static readonly Regex AccountKeyRegex = new Regex(@"AccountKey=[^;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }
}
