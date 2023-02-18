# Durable Functions Monitor for Netherite storage provider

Custom Durable Functions Monitor backend project to be used with [Netherite Provider](https://microsoft.github.io/durabletask-netherite/#/).

NOTE: The monitored function app must be running; otherwise DFM cannot display any information about the taskhub. 
Thus, if the monitored application is unresponsive (because of excessive CPU or IO load, for example), DFM is unresponsive as well. 
This is different than with Azure Storage provider or the Microsoft SQL provider, where the storage service can be queried directly.

# How to run locally

1. Clone this repo.

2. In the project's folder create a `local.settings.json` file containing the required connection strings:
```
{
  "IsEncrypted": false,
  "Values": {
    "DFM_NONCE": "i_sure_know_what_i_am_doing",
    "AzureWebJobsStorage": "insert-azure-storage-connection-string-here",
    "EventHubsConnection": "insert-eventhubs-sas-connection-string-here"
  },
  "Host": {
    "LocalHttpPort": 7072
  }
}
```
If you prefer to not enter the connection strings into a file, you can omit the respective lines and use environment variables (same names) instead. 

3. Edit the host.json file, specifying the correct *taskhub name*. It must match the taskhub name of the app you wish to monitor.

4. Enter the Dfm.Netherite directory from a console, and enter `func start`

5. If it does not open by itself, direct your browser to http://localhost:7072/. 
   You can change this port and whether to open the browser in Properties/launchSettings.json

WARNING: setting **DFM_NONCE** to `i_sure_know_what_i_am_doing` **turns authentication off**. Please, protect your endpoint as appropriate.


## How to run [as a Docker container](https://hub.docker.com/repository/docker/scaletone/durablefunctionsmonitor.mssql)

* `docker pull scaletone/durablefunctionsmonitor.netherite:[put-latest-tag-here]`
* `docker run -p 7072:80 -e AzureWebJobsStorage="your-storage-connection-string"  -e EventHubsConnection="your-event-hubs-connection-string" -e DFM_NONCE="i_sure_know_what_i_am_doing" scaletone/durablefunctionsmonitor.netherite:[put-latest-tag-here]`

   WARNING: setting **DFM_NONCE** to `i_sure_know_what_i_am_doing` **turns authentication off**. Please, protect your endpoint as appropriate.
   
   If you are using a custom database schema name, then specify that schema name via `AzureFunctionsJobHost__extensions__durableTask__storageProvider__schemaName` config setting.

* Navigate to http://localhost:7072


# How to deploy to Azure

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmicrosoft%2FDurableFunctionsMonitor%2Fmain%2Fcustom-backends%2Fnetherite%2Farm-template.json)

The above button will deploy *these sources* into *your newly created* Function App instance.
