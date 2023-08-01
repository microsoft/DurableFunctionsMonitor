// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Text.RegularExpressions;
using System.Reflection;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public static class About
    {
        // Returns short connection info and backend version. 
        // GET /a/p/i/{connName}-{hubName}/about
        [Function(nameof(DfmAboutFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public static async Task<HttpResponseData> DfmAboutFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/about")] HttpRequestData req,
            string connName,
            string hubName,
            FunctionContext context
        )
        {
            var mode = (DfmMode)context.Items[Globals.DfmModeContextValue];

            string accountName = string.Empty;

            string storageConnString = Environment.GetEnvironmentVariable(Globals.GetFullConnectionStringEnvVariableName(connName));
            var match = AccountNameRegex.Match(storageConnString ?? string.Empty);
            if (match.Success)
            {
                accountName = match.Groups[1].Value;
            }

            var permissions = new List<string>();

            if (mode == DfmMode.Normal)
            {
                permissions.Add("DurableFunctionsMonitor.ReadWrite");
            }

            return await req.ReturnJson(new 
            {
                accountName,
                hubName = hubName,
                version = Assembly.GetExecutingAssembly().GetName().Version.ToString(),
                permissions
            });            
        }

        private static readonly Regex AccountNameRegex = new Regex(@"AccountName=(\w+)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    }
}