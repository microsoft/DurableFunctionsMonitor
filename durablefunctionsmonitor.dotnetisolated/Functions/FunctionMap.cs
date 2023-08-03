// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Logging;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class FunctionMap : DfmFunctionBase
    {
        public FunctionMap(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : base(dfmSettings, extensionPoints)
        {
            this._logger = loggerFactory.CreateLogger<FunctionMap>();
        }

        // Tries to fetch a Function Map for a given Task Hub. 
        // Function Maps are specially formatted JSON files, they come either from a predefined folder
        // in the Blob Storage, or from a custom local folder.
        // GET /{connName}-{hubName}/a/p/i/delete-task-hub
        [Function(nameof(DfmGetFunctionMap))]
        public async Task<HttpResponseData> DfmGetFunctionMap(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/function-map")] HttpRequestData req,
            string connName,
            string hubName)
        {
            // The underlying Task never throws, so it's OK.
            var functionMapsMap = await CustomTemplates.GetFunctionMapsAsync(this.Settings);

            var functionMapJson = functionMapsMap.GetFunctionMap(hubName);
            if (string.IsNullOrEmpty(functionMapJson))
            {
                return req.ReturnStatus(HttpStatusCode.NotFound, "No Function Map provided");
            }

            var response = req.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", "application/json; charset=UTF-8");
            await response.WriteStringAsync(functionMapJson);

            return response;
        }

        private readonly ILogger _logger;
    }
}