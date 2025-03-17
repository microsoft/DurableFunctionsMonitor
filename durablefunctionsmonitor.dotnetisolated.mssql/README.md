# DurableFunctionsMonitor.DotNetIsolated.MsSql

An incarnation of DurableFunctionsMonitor that can be "injected" into your [.NET Isolated](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide) Azure Function, that uses [Durable Task SQL Provider](https://microsoft.github.io/durabletask-mssql/#/).

## How to use

* Install from NuGet:
   ```
   dotnet add package DurableFunctionsMonitor.DotNetIsolated.MsSql
   ```
* Initialize by calling **.UseDurableFunctionsMonitorWithMsSqlDurability()** extension method during your Function's startup, like this:
   ```
  var host = new HostBuilder()
      .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) => {

          workerAppBuilder.UseDurableFunctionsMonitorWithMsSqlDurability();

      })
      .Build();
   ```


   By default all settings are read from env variables ([all the same config settings](https://github.com/microsoft/DurableFunctionsMonitor/wiki/Config-Settings-Reference) are supported), but those can be programmatically (re)configured like this:
   ```
   var host = new HostBuilder()
       .ConfigureFunctionsWorkerDefaults((hostBuilderContext, workerAppBuilder) => {
   
           workerAppBuilder.UseDurableFunctionsMonitorWithMsSqlDurability((settings) => 
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
