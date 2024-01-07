// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Extensions.Hosting;
using DurableFunctionsMonitor.DotNetIsolated;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) =>
    {
        workerAppBuilder.UseDurableFunctionsMonitor();
    })
    .Build();

host.Run();
