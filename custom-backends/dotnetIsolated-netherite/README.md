# Durable Functions Monitor .Net Isolated for Netherite

Custom Durable Functions Monitor .NET Isolated backend project to be used with [Netherite Provider](https://microsoft.github.io/durabletask-netherite/#/).

## How to run locally

* Clone this repo.
* In the project's folder create a `local.settings.json` file, which should look like this:

```
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsSecretStorageType": "files",
    "AzureWebJobsStorage": "your-azure-storage-connection-string",
    "EventHubsConnection": "your-event-hubs-connection-string",
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
