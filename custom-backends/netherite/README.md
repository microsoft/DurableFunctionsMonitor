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
  }
}
```
If you prefer to no enter the connection strings into a file, you can omit the respective lines and use environment variables (same names) instead. 

3. Edit the host.json file, specifying the correct *taskhub name*. It must match the taskhub name of the app you wish to monitor.

4. Enter the Dfm.Netherite directory from a console, and enter `func start`

5. If it does not open by itself, direct your browser to http://localhost:7072/. 
   You can change this port and whether to open the browser in Prperties/launchSettings.json

CAUTION: the configuration settings as above do not protect this endpoint.

