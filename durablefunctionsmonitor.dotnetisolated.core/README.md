# DurableFunctionsMonitor.DotNetIsolated.Core

An incarnation of DurableFunctionsMonitor that can be "injected" into your [.NET 7 Isolated](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide) Azure Function.

NOTE that this functionality is *in preview*.

## How to use

* Install from NuGet:
   ```
   dotnet add package DurableFunctionsMonitor.DotNetIsolated --version 6.4.0
   ```
* Initialize by calling **.UseDurableFunctionMonitor()** extension method during your Function's startup, like this:
   ```
  var host = new HostBuilder()
      .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) => {

          workerAppBuilder.UseDurableFunctionsMonitor();

      })
      .Build();
   ```


   By default all settings are read from env variables ([all the same config settings](https://github.com/microsoft/DurableFunctionsMonitor/wiki/Config-Settings-Reference) are supported), but those can be programmatically (re)configured like this:
   ```
   var host = new HostBuilder()
       .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) => {
   
           workerAppBuilder.UseDurableFunctionsMonitor((settings, extensionPoints) => 
           {
               // Override DfMon's settings here, e.g.
               settings.Mode = DfmMode.ReadOnly;
               // ....
           });
   
       })
       .Build();
   ```
   
   By default DfMon's endpoint will appear at `http://localhost:7071/my-api-route-prefix/durable-functions-monitor`. To override that behavior (e.g. to have it served from the root) add a custom statics-serving function like this:
   ```
   namespace DurableFunctionsMonitor.DotNetIsolated
   {
       public class MyCustomDfMonEndpoint: ServeStatics
       {
           public MyCustomDfMonEndpoint(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : 
               base(dfmSettings, extensionPoints, loggerFactory)
           {
           }
   
           [Function(nameof(MyCustomDfMonEndpoint))]
           public Task<HttpResponseData> ServeDfMonStatics(
               [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "/{p1?}/{p2?}/{p3?}")] HttpRequestData req,
               string p1,
               string p2,
               string p3
           )
           {
               return this.DfmServeStaticsFunction(req, p1, p2, p3);
           }
       }
   }
   ```

## Limitations

* Multiple Storage connection strings are not supported, only the default one (`AzureWebJobsStorage`).
* For non-default durability providers you'll need to provide custom routines for retrieving instance history etc. This should be done via **extensionPoints** parameter of **.UseDurableFunctionsMonitor()** configuration method. Code for MSSQL storage provider can be directly copied [from here](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/custom-backends/mssql/Startup.cs).

