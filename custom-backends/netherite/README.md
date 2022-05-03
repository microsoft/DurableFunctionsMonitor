# Durable Functions Monitor for Netherite storage provider

Custom Durable Functions Monitor backend project to be used with [Netherite Provider](https://microsoft.github.io/durabletask-netherite/#/).

NOTE: The monitored function app must be running; otherwise DFM cannot display any information about the taskhub. 
Thus, if the monitored application is unresponsive (because of excessive CPU or IO load, for example), DFM is unresponsive as well. 
This is different than with Azure Storage provider or the Microsoft SQL provider, where the storage service can be queried directly.

# How to run locally

To connect to a taskhub, make sure to set the following parameters to match the taskhub name of the app you wish to monitor:

1. Specify the *taskhub name* in the file host.json. It must match the taskhub name of the app you wish to monitor.
2. Specify the *AzureWebJobsStorage* connection string. You can use environment variable, or edit the local.settings.json file.
3. Specify the *EventHubsConnection* connection string. You can set an environment variable, or edit the local.settings.json file.

Start the monitor with `func start`, then direct your browser to http://localhost:7072/. 

CAUTION: the configuration settings in local.settings.json do not protect the endpoint.

