# Durable Functions Monitor on .Net 7 Isolated

Custom Durable Functions Monitor backend project, configured to run as a .NET 7 Isolated Function.

## How to run locally

* Clone this repo.
* In the project's folder create a `local.settings.json` file, which should look like this:

```
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "your-storage-connection-string",
    "FUNCTIONS_WORKER_RUNTIME": "dotnet-isolated",
    "DFM_NONCE": "i_sure_know_what_i_am_doing"
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
