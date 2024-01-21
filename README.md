![logo](https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/orchestrations2.png) 
# Durable Functions Monitor

A monitoring/debugging UI tool for Azure Durable Functions

[Azure Durable Functions](https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview) provide an easy and elegant way of building cloud-native Reliable Stateful Services in the Serverless world. The only thing that's missing so far is a UI for monitoring, managing and debugging your orchestration instances. This project tries to bridge the gap.

[<img alt="Nuget" src="https://img.shields.io/nuget/v/DurableFunctionsMonitor.DotNetBackend?label=current%20version">](https://www.nuget.org/profiles/durablefunctionsmonitor)  <img src="https://dev.azure.com/kolepes/DurableFunctionsMonitor/_apis/build/status/microsoft.DurableFunctionsMonitor?branchName=main"/>


[<img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/microsoft/durablefunctionsmonitor?label=GitHub%20stars">](https://github.com/microsoft/DurableFunctionsMonitor/stargazers) [<img alt="Visual Studio Marketplace Rating" src="https://img.shields.io/visual-studio-marketplace/r/DurableFunctionsMonitor.durablefunctionsmonitor?label=VsCode%20extension%20rating">
](https://marketplace.visualstudio.com/items?itemName=DurableFunctionsMonitor.durablefunctionsmonitor)


[<img alt="Visual Studio Marketplace Installs" src="https://img.shields.io/visual-studio-marketplace/i/DurableFunctionsMonitor.DurableFunctionsMonitor?label=VsCode%20extension%20installs">](https://marketplace.visualstudio.com/items?itemName=DurableFunctionsMonitor.durablefunctionsmonitor) [<img src="https://img.shields.io/docker/pulls/scaletone/durablefunctionsmonitor"/>](https://hub.docker.com/r/scaletone/durablefunctionsmonitor) [<img alt="Nuget" src="https://img.shields.io/nuget/dt/DurableFunctionsMonitor.DotNetBackend?label=NuGet%20downloads">](https://www.nuget.org/profiles/durablefunctionsmonitor)

## How to use

You can run this tool [as a VsCode extension](https://marketplace.visualstudio.com/items?itemName=DurableFunctionsMonitor.durablefunctionsmonitor), [as a Standalone service](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-run-DfMon-in-Standalone-mode) or [in Injected mode](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.dotnetbackend/NUGET_README.md) (installed [as a NuGet package](https://www.nuget.org/profiles/durablefunctionsmonitor) to your .NET Functions project).

See [detailed instructions in our Wiki](https://github.com/microsoft/DurableFunctionsMonitor/wiki).

## Contents of this repo

* [durablefunctionsmonitor.dotnetbackend](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend) - the main component, implemented as a .NET-based Azure Function. Implements a thin layer of RESTful APIs on top of [Durable Task Framework](https://github.com/Azure/azure-functions-durable-extension), also serves [client UI statics](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.react).
* [durablefunctionsmonitor.react](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.react) - client UI implementation. A React app written in TypeScript. Compiled HTML/JS/CSS statics from this project are copied to [this folder](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend/DfmStatics) and then served by the backend.
* [durablefunctionsmonitor-vscodeext](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor-vscodeext) - VsCode extension implementation, written in TypeScript.
* [custom-backends](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends) - a set of backend implementations for older framework versions or non-default storage providers (e.g. for [MSSQL](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends/mssql) and [Netherite](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/custom-backends/netherite)).

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
