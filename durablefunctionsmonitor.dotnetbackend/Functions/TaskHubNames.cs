// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks;
using System.Collections.Generic;
using System;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public static class TaskHubNames
    {
        // Returns all Task Hub names from the current Storage
        // GET /a/p/i/task-hub-names
        [FunctionName(nameof(DfmGetTaskHubNamesFunction))]
        public static Task<IActionResult> DfmGetTaskHubNamesFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "a/p/i/task-hub-names")] HttpRequest req,
            ILogger log
        )
        {
            return req.HandleAuthAndErrors(OperationKind.Read, null, null, log, async () => {

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
                    return new ObjectResult("Failed to load the list of Task Hubs") { StatusCode = 500 };
                }
                return hubNames.ToJsonContentResult();
            });
        }
    }
}