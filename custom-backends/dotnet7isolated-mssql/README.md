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
