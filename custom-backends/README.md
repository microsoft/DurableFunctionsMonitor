# Custom backends for Durable Functions Monitor

These are Azure Function projects with Durable Functions Monitor 'injected' as a [NuGet package](https://www.nuget.org/profiles/durablefunctionsmonitor). To be used for e.g. monitoring [custom storage providers](https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-storage-providers).

* [dotnetIsolated](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends/dotnetIsolated) - Durable Functions Monitor .NET 8 Isolated backend.
* [dotnetIsolated-mssql](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends/dotnetIsolated-mssql) - Durable Functions Monitor .NET 8 Isolated backend to be used with [Durable Task SQL Provider](https://microsoft.github.io/durabletask-mssql/#/).
* [dotnetIsolated-netherite](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends/dotnetIsolated-netherite) - Durable Functions Monitor .NET 8 Isolated backend to be used with [Netherite Provider](https://microsoft.github.io/durabletask-netherite/#/).
