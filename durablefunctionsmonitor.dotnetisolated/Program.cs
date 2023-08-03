// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Hosting;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    internal class Program
    {
        private static void Main(string[] args)
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) => {

                    workerAppBuilder.UseDurableFunctionsMonitor(hostBuilderContext, (settings, extensionPoints) => 
                    {
                        // Need to reinitialize CustomUserAgent
                        TableClient.CustomUserAgent = $"DurableFunctionsMonitorIsolated-Standalone/{Globals.GetVersion()}";
                    });

                })
                .Build();

            host.Run();
        }
    }
}