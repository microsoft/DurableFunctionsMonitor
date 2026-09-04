// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Hosting;
using DurableFunctionsMonitor.DotNetIsolated.Netherite;

namespace Dfm.DotNetIsolatedNetherite
{
    internal class Program
    {
        private static void Main(string[] args)
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) =>
                {
                    workerAppBuilder.UseDurableFunctionsMonitorWithNetheriteDurability();
                })
                .Build();

            host.Run();
        }
    }
}
