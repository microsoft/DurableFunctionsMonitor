# Durable Functions Monitor for MSSQL storage provider

Custom Durable Functions Monitor backend project to be used with [Durable Task SQL Provider](https://microsoft.github.io/durabletask-mssql/#/).

## How to run locally

* Clone this repo.
* In the project's folder create a `local.settings.json` file, which should look like this:

```
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsSecretStorageType": "files",
    "DFM_SQL_CONNECTION_STRING": "your-mssql-connection-string",
    "DFM_HUB_NAME": "mssql",
    "DFM_NONCE": "i_sure_know_what_i_am_doing",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet"
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

* Navigate to http://localhost:7072


# How to deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fscale-tone%2FDurableFunctionsMonitor%2Fmaster%2Fcustom-backends%2Fmssql%2Farm-template.json)

The above button will deploy *these sources* into *your newly created* Function App instance.
