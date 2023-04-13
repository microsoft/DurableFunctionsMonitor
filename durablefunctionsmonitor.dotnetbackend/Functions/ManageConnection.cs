// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public static class ManageConnection
    {
        // Gets Storage Connection String and Hub Name
        // GET /a/p/i/{connName}-{hubName}/manage-connection
        [FunctionName(nameof(DfmGetConnectionInfoFunction))]
        public static Task<IActionResult> DfmGetConnectionInfoFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/manage-connection")] HttpRequest req,
            string connName,
            string hubName,
            ExecutionContext executionContext,
            ILogger log)
        {
            return req.HandleAuthAndErrors(OperationKind.Read, connName, hubName, log, async mode => {

                string localSettingsFileName = Path.Combine(executionContext.FunctionAppDirectory, "local.settings.json");

                string connectionString = 
                    Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName)) ?? 
                    string.Empty;
                
                // No need for your accountKey to ever leave the server side
                connectionString = AccountKeyRegex.Replace(connectionString, "AccountKey=*****");

                return new { connectionString, hubName = hubName, isReadOnly = true }.ToJsonContentResult();
            });
        }

        private static readonly Regex AccountKeyRegex = new Regex(@"AccountKey=[^;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }
}
