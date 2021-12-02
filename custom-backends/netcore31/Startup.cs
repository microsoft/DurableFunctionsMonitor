// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using DurableFunctionsMonitor.DotNetBackend;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Hosting;

[assembly: WebJobsStartup(typeof(Dfm.NetCore31.Startup))]
namespace Dfm.NetCore31
{
    public class Startup : IWebJobsStartup
    {
        public void Configure(IWebJobsBuilder builder)
        {
            DfmEndpoint.Setup();
        }
    }
}
