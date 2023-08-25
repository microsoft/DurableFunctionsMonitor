using Microsoft.Extensions.Hosting;
using DurableFunctionsMonitor.DotNetIsolated;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) =>
    {
        workerAppBuilder.UseDurableFunctionsMonitor();
    })
    .Build();

host.Run();
