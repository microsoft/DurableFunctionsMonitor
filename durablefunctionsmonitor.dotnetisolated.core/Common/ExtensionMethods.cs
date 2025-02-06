// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Net;
using System.Reflection;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Extension methods for configuring DfMon
    /// </summary>
    public static class ExtensionMethods
    {
        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IFunctionsWorkerApplicationBuilder UseDurableFunctionsMonitor(
            this IFunctionsWorkerApplicationBuilder builder,
            Action<DfmSettings, DfmExtensionPoints> optionsBuilder = null
        )
        {
            // Initializing settings and placing them into DI container
            var settings = new DfmSettings();
            var extensionPoints = new DfmExtensionPoints();

            // Allowing to override settings
            if (optionsBuilder != null)
            {
                optionsBuilder(settings, extensionPoints);
            }

            // Also initializing CustomUserAgent value based on input parameters
            string dfmNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            if (!string.IsNullOrEmpty(dfmNonce) && (dfmNonce != Auth.ISureKnowWhatIAmDoingNonce))
            {
                TableClient.CustomUserAgent = $"DurableFunctionsMonitorIsolated-VsCodeExt/{Globals.GetVersion()}";
            }
            else if (!string.IsNullOrEmpty(settings.CustomUserAgentPrefix)) 
            {
                TableClient.CustomUserAgent = $"{settings.CustomUserAgentPrefix}/{Globals.GetVersion()}";
            }
            else
            {
                TableClient.CustomUserAgent = $"DurableFunctionsMonitorIsolated-Injected/{Globals.GetVersion()}";
            }

            // Placing settings and extension points into DI container
            builder.Services.AddSingleton(settings);
            builder.Services.AddSingleton(extensionPoints);

            // Checking host.json for a custom dedicated Storage account
            string hostJsonFileName = GetHostJsonPath();
            if (File.Exists(hostJsonFileName))
            {
                dynamic hostJson = JObject.Parse(File.ReadAllText(hostJsonFileName));

                string connStringNameFromHostJson = 
                    hostJson?.extensions?.durableTask?.storageProvider?.azureStorageConnectionStringName ??
                    hostJson?.extensions?.durableTask?.storageProvider?.connectionStringName;

                if (!string.IsNullOrEmpty(connStringNameFromHostJson))
                {
                    Globals.StorageConnStringEnvVarName = connStringNameFromHostJson;
                }
            }

            // Adding middleware
            builder.UseWhen
            (
                (FunctionContext context) =>
                {
                    // This middleware is only for http trigger invocations.
                    return context
                        .FunctionDefinition
                        .InputBindings
                        .Values
                        .First(a => a.Type.EndsWith("Trigger"))
                        .Type == "httpTrigger";
                },

                async (FunctionContext context, Func<Task> next) =>
                {
                    var log = context.InstanceServices.GetRequiredService<ILogger<object>>();
                    var request = await context.GetHttpRequestDataAsync() ?? throw new ArgumentNullException("HTTP Request is null");

                    OperationKind? operationKind = null;
                    try
                    {
                        // Checking that it is DfMon's Function
                        operationKind = TryGetDfmOperationKind(context, log);

                        if (operationKind.HasValue)
                        {
                            // If so, invoking DfMon's auth logic
                            var dfmMode = await Auth.ValidateIdentityAsync(request, operationKind.Value, settings, extensionPoints);

                            // Propagating DfmMode to Functions
                            context.Items.Add(Globals.DfmModeContextValue, dfmMode);
                        }

                        await next();
                    }
                    catch (DfmUnauthorizedException ex)
                    {
                        log.LogError(ex, "DFM failed to authenticate request");
                        context.GetInvocationResult().Value = await request.ReturnStatus(HttpStatusCode.Unauthorized);
                    }
                    catch (DfmAccessViolationException ex)
                    {
                        log.LogError(ex, "DFM failed to authorize request");
                        context.GetInvocationResult().Value = await request.ReturnStatus(HttpStatusCode.Forbidden);
                    }
                    catch (Exception ex)
                    {
                        if (operationKind.HasValue)
                        {
                            // Only handling DfMon's exceptions
                            log.LogError(ex, "DFM failed");
                            context.GetInvocationResult().Value = await request.ReturnStatus(HttpStatusCode.BadRequest, ex.Message);
                        }
                        else
                        {
                            throw;
                        }
                    }
                }
             );

            return builder;
        }

        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IHostBuilder UseDurableFunctionsMonitor(this IHostBuilder hostBuilder, Action<DfmSettings, DfmExtensionPoints> optionsBuilder = null)
        {
            return hostBuilder.ConfigureFunctionsWorkerDefaults((HostBuilderContext builderContext, IFunctionsWorkerApplicationBuilder builder) =>
            {
                builder.UseDurableFunctionsMonitor(optionsBuilder);
            });
        }

        /// <summary>
        /// Tries to locate host.json file and returns path to it
        /// </summary>
        public static string GetHostJsonPath()
        {
            string assemblyLocation = Assembly.GetExecutingAssembly().Location;

            // First trying current folder
            string result = Path.Combine(Path.GetDirectoryName(assemblyLocation), "host.json");

            if (File.Exists(result))
            {
                return result;
            }

            // Falling back to parent folder
            result = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(assemblyLocation)), "host.json");

            return result;
        }

        private static OperationKind? TryGetDfmOperationKind(FunctionContext context, ILogger log)
        {
            try
            {
                var funcAssembly = Assembly.LoadFrom(context.FunctionDefinition.PathToAssembly);

                var funcMethodNameParts = context.FunctionDefinition.EntryPoint.Split('.');
                var funcMethodName = funcMethodNameParts.Last();
                var funcMethodTypeName = string.Join('.', funcMethodNameParts.Take(funcMethodNameParts.Length - 1));

                var funcType = funcAssembly.GetType(funcMethodTypeName);
                var funcMethodInfo = funcType.GetMethod(funcMethodName);

                var attr = funcMethodInfo.GetCustomAttribute<OperationKindAttribute>();
                if (attr != null)
                {
                    return attr.Kind;
                }
            }
            catch(Exception ex)
            {
                log.LogWarning(ex, "DFM failed to load Function's MethodInfo");
            }

            return null;
        }
    }
}