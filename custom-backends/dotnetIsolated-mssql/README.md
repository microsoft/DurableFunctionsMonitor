# Durable Functions Monitor .Net 7 Isolated for MSSQL

Custom Durable Functions Monitor .NET 7 Isolated backend project to be used with [Durable Task SQL Provider](https://microsoft.github.io/durabletask-mssql/#/).

## How to run locally

* Clone this repo.
* In the project's folder create a `local.settings.json` file, which should look like this:

```
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsSecretStorageType": "files",
    "DFM_SQL_CONNECTION_STRING": "your-mssql-connection-string",
    "DFM_NONCE": "i_sure_know_what_i_am_doing",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
  },
  "Host": {
    "LocalHttpPort": 7072
  }
}
```

* Go to the project's folder with your command prompt and type the following:

```
func start
```

* Navigate to http://localhost:7072/durable-functions-monitor


## How to deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmicrosoft%2FDurableFunctionsMonitor%2Fmain%2Fcustom-backends%2FdotnetIsolated-mssql%2Farm-template.json) 

This button will deploy a new DfMon instance into your Azure Subscription from [this NuGet package](https://www.nuget.org/packages/DurableFunctionsMonitor.DotNetIsolated.MsSql/). You will need to have an AAD app created and specify its Client Id as one of the template parameters. 

See instructions on [how to configure authentication/authorization here](How-to-configure-authentication).

NOTE: the instance will be deployed to the selected Resource Group's location. The default **Region** parameter in Azure Portal's *Deploy from a custom template* wizard has no effect here. It only defines where the deployment metadata will be stored, so feel free to leave it to default.

