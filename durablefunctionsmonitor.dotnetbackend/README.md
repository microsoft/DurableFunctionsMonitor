# DurableFunctionsMonitor.DotNetBackend

Backend for DurableFunctionsMonitor. Also serves the UI statics (at root URL: http://localhost:7072).

Use this project as a standalone service, either run it locally or [deploy to Azure](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-run-DfMon-in-Standalone-mode) (and **protect** with AAD).

## Prerequisites

To run this on your devbox you need to have [Azure Functions Core Tools](https://www.npmjs.com/package/azure-functions-core-tools) globally installed (which is normally already the case, if you're working with Azure Functions - just ensure that you have the latest version of it).

## How to run locally

* Clone this repo.
* Open command line in **durablefunctionsmonitor.dotnetbackend** folder.
* Run **node setup-and-run.js**. This setup script will ask you to provide the Connection String to your Azure Storage and the Hub Name, that your existing Durable Functions are using, and put it into **local.settings.json** file. Then it will run the Functions project (do the **func start**) and open the UI page (http://localhost:7072) in your favourite browser. If not, then just navigate to that URL yourself (on a Mac it is reported to be more preferrable to open http://127.0.0.1:7072 instead).
* Alternatively you can just create **local.settings.json** file yourself, then run **func start** and open the UI page in your browser manually.

   The home page will show you the list of existing Task Hubs to choose from. WARNING: by default, *all* Task Hubs in the underlying Storage account are accessible. To restrict the list of allowed Task Hubs in your **local.settings.json** file specify an extra **DFM_HUB_NAME** config setting with a comma-separated list of Task Hub names. A complete Config Settings Reference [can be found here](https://github.com/microsoft/DurableFunctionsMonitor/wiki/Config-Settings-Reference).
   
   WARNING: when running locally, by default there will be **no authentication**. Please, protect your endpoint as appropriate.
    
For all other ways to run this tool and all further instructions [check out our wiki](https://github.com/microsoft/DurableFunctionsMonitor/wiki).

## Implementation Details

The backend is a C#-written Azure Function itself, that leverages [Durable Functions management interface](https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-instance-management) and adds paging/filtering/sorting/etc. capabilities on top of it. UI is a set of static build artifacts from [this project](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.react), committed into [this folder](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend/DfmStatics) and served by [this function](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.dotnetbackend/Functions/ServeStatics.cs). 

By default, Azure Functions runtime exposes a /runtime/webhooks/durabletask endpoint, which (when running locally) doesn't have any auth and returns quite sensitive data. That endpoint is being suppressed via [proxies.json](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.dotnetbackend/proxies.json). Still, when running on your devbox, please, ensure that the HTTP port you're using is not accessible externally.

When this backend is run as part of [VsCode extension](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor-vscodeext), it's being [protected with a random nonce](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.dotnetbackend/Common/Auth.cs#L42), so that nobody else could make calls to it except your VsCode instance.

When deployed to Azure, your DFM instance **must** be secured with [Easy Auth](https://docs.microsoft.com/en-us/azure/app-service/overview-authentication-authorization). Support for AAD login was added to **v.1.1.0** (client side [signs the user in and obtains an access token](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.react/src/states/LoginState.ts), backend [validates the token and the user](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor.dotnetbackend/Common/Globals.cs#L62)), but it needs to be configured properly, as described above.
