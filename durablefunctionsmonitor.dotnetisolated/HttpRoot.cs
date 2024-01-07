// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Logging;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Exposes DfMon at the root
    /// </summary>
    public class HttpRoot: ServeStatics
    {
        public HttpRoot(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : 
            base(dfmSettings, extensionPoints, loggerFactory)
        {
        }

        [Function(nameof(HttpRoot))]
        public Task<HttpResponseData> ServeDfMonStatics(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "/{p1?}/{p2?}/{p3?}")] HttpRequestData req,
            string p1,
            string p2,
            string p3
        )
        {
            return this.DfmServeStaticsFunction(req, p1, p2, p3);
        }
    }
}
