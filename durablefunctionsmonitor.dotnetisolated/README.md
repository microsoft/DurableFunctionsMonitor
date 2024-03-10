# DurableFunctionsMonitor.DotNetIsolated

"Standalone" [.NET 7 Isolated](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide) version of DurableFunctionsMonitor backend.

## How to deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmicrosoft%2FDurableFunctionsMonitor%2Fmain%2Fdurablefunctionsmonitor.dotnetisolated%2Farm-template.json) 

This button will deploy a new DfMon instance into your Azure Subscription from [this NuGet package](https://www.nuget.org/packages/DurableFunctionsMonitor.DotNetIsolated/). You will need to have an AAD app created and specify its Client Id as one of the template parameters. 

See instructions on [how to configure authentication/authorization here](How-to-configure-authentication).

NOTE: the instance will be deployed to the selected Resource Group's location. The default **Region** parameter in Azure Portal's *Deploy from a custom template* wizard has no effect here. It only defines where the deployment metadata will be stored, so feel free to leave it to default.

## Limitations

* Multiple Storage connection strings are not supported, only the default one (`AzureWebJobsStorage`).
