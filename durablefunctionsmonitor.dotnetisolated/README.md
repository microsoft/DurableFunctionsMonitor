# DurableFunctionsMonitor.DotNetIsolated

DurableFunctionsMonitor backend that can be 'injected' into your [.NET 7 Isolated](https://learn.microsoft.com/en-us/azure/azure-functions/dotnet-isolated-process-guide) Azure Function.

## How to use

* Install from NuGet:
   ```
   dotnet add package DurableFunctionsMonitor.DotNetIsolated --version 6.3.0-beta1
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

## Limitations

* No way to configure the path to your DfMon's endpoint, so it will always appear at `http://localhost:7071/my-api-route-prefix/durable-functions-monitor`. But you can always do a redirect from root into there, if needed:
   ```
  [Function(nameof(HttpRoot))]
  public HttpResponseData Run([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "/")] HttpRequestData req)
  {
      var response = req.CreateResponse(HttpStatusCode.TemporaryRedirect);
      response.Headers.Add("Location", "durable-functions-monitor");
      return response;
  }
   ```
* Multiple Storage connection strings are not supported, only the default one (`AzureWebJobsStorage`).
* Support for Durable Entities is limited (since they are not supported in Isolated mode yet anyway).
* For non-default durability providers you'll need to provide custom routines for retrieving instance history etc. This should be done via **extensionPoints** parameter of **.UseDurableFunctionsMonitor()** configuration method. Code for MSSQL storage provider can be directly copied [from here](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/custom-backends/mssql/Startup.cs).

