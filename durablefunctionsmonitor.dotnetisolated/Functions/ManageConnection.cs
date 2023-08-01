// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Text.RegularExpressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public static class ManageConnection
    {
        // Gets Storage Connection String and Hub Name
        // GET /a/p/i/{connName}-{hubName}/manage-connection
        [Function(nameof(DfmGetConnectionInfoFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public static async Task<HttpResponseData> DfmGetConnectionInfoFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/manage-connection")] HttpRequestData req,
            string connName,
            string hubName,
            ExecutionContext executionContext)
        {
            string connectionString = 
                Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName)) ?? 
                string.Empty;
            
            // No need for your accountKey to ever leave the server side
            connectionString = AccountKeyRegex.Replace(connectionString, "AccountKey=*****");

            return await req.ReturnJson(new { connectionString, hubName = hubName, isReadOnly = true });
        }

        private static readonly Regex AccountKeyRegex = new Regex(@"AccountKey=[^;]+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }
}
