// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Hosting;
using DurableFunctionsMonitor.DotNetIsolated.MsSql;

namespace Dfm.DotNetIsolatedMsSql
{
    internal class Program
    {
        private static void Main(string[] args)
        {
            var host = new HostBuilder()
                .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) =>
                {
                    workerAppBuilder.UseDurableFunctionsMonitorWithMsSqlDurability();
                })
                .Build();

            host.Run();
        }
    }
}