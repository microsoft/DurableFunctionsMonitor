// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Text.RegularExpressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class ManageConnection : DfmFunctionBase
    {
        public ManageConnection(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints) : base(dfmSettings, extensionPoints) { }
        
        // Gets Storage Connection String and Hub Name
        // GET /a/p/i/{connName}-{hubName}/manage-connection
        [Function(nameof(DfmGetConnectionInfoFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetConnectionInfoFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/manage-connection")] HttpRequestData req,
            string connName,
            string hubName)
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
