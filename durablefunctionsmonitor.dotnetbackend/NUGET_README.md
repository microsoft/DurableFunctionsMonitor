A monitoring/debugging UI tool for [Azure Durable Functions](https://docs.microsoft.com/en-us/azure/azure-functions/durable/durable-functions-overview), now also available as a NuGet package.
## How to use

This package you can either [![Deploy to Azure](https://raw.githubusercontent.com/Azure/azure-quickstart-templates/master/1-CONTRIBUTION-GUIDE/images/deploytoazure.svg?sanitize=true)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmicrosoft%2FDurableFunctionsMonitor%2Fmain%2Fdurablefunctionsmonitor.dotnetbackend%2Farm-template.json) or install into your own Azure Functions .Net Core project:

  * `dotnet add package DurableFunctionsMonitor.DotNetBackend`
  * Make sure `AzureWebJobsStorage` config setting is set correctly - it should point to a Storage where your Task Hub(s) reside.
  * Invoke **DfmEndpoint.Setup();** method at your Function's startup. E.g. like this:

   ```
	[assembly: WebJobsStartup(typeof(StartupNs.Startup))]
	namespace StartupNs 
	{
		public class Startup : IWebJobsStartup
		{
			public void Configure(IWebJobsBuilder builder)
			{
				DfmEndpoint.Setup();
			}
		}
	}
   ```


  * Now DfMon endpoint should become available at your Function's *root* URL, which is typically https://my-func/api (or https://my-func/my-route-prefix, if you've customized [routePrefix](https://microsoft.github.io/AzureTipsAndTricks/blog/tip64.html) setting in your host.json)
     NOTE: by default it will *overshadow* all your existing HTTP-triggered functions. If you don't want that to happen, add `DurableFunctionsMonitorRoutePrefix` setting to your CSPROJ-file:
          
     ![image](https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/DurableFunctionsMonitorRoutePrefix.png)


     This will make DfMon be served from https://my-func/api/my-durable-functions-monitor.

 
   **IMPORTANT1**: that endpoint still does all the AuthN/AuthZ logic, in the same way as standalone DfMon does. Which means that **EasyAuth** needs to be configured appropriately for your Function instance, [just like for a standalone DfMon instance](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend#how-to-run). If you do want to disable AuthN/AuthZ for that endpoint, either set `DFM_NONCE` config setting to `i_sure_know_what_i_am_doing` or call `DfmEndpoint.Setup()` method like this:

   ```
        DfmEndpoint.Setup(new DfmSettings { DisableAuthentication = true });
   ```


   **IMPORTANT2**: a person who is able to access your DfMon endpoint can potentially also access *all* HTTP-triggered endpoints in your project. Make sure you configure AuthN/AuthZ properly.

   **IMPORTANT3**: by default the endpoint exposes *all* Task Hubs in the underlying Storage account. Restrict the list of allowed Task Hubs either via `DFM_HUB_NAME` config setting (takes a comma-separated list) or via `extensions.durableTask.hubName` setting in your host.json.

Additional optional properties of **DfmSettings** class to further configure your DfMon endpoint are as follows:
* **DisableAuthentication** - disables all authentication. Make sure you know what you're doing.
* **Mode** - functional mode for this DfMon endpoint. Currently only `DfmMode.Normal` (default) and `DfmMode.ReadOnly` are supported.
* **AllowedUserNames** - list of users, that are allowed to access this DfMon endpoint. You typically put emails into here. Once set, the incoming access token is expected to contain one of these names in its 'preferred_username' claim.
* **AllowedAppRoles** - list of App Roles, that are allowed to access DurableFunctionsMonitor endpoint. Users/Groups then need to be assigned one of these roles via AAD Enterprise Applications->[your AAD app]->Users and Groups tab. Once set, the incoming access token is expected to contain one of these in its 'roles' claim.
* **CustomTemplatesFolderName** - folder where to search for custom tab/html templates. Must be a part of your Functions project and be adjacent to your host.json file.
 
Alternatively you can call `DfmEndpoint.Setup();` with no parameters and configure your DfMon endpoint with config settings (environment variables). The list of all supported config settings [can be found here](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend#config-setting-reference).
