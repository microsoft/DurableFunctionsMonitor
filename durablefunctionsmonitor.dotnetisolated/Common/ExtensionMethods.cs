// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Net;
using System.Reflection;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public static class ExtensionMethods
    {
        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IFunctionsWorkerApplicationBuilder UseDurableFunctionsMonitor(
            this IFunctionsWorkerApplicationBuilder builder, 
            HostBuilderContext builderContext, Action<DfmSettings> settingsBuilder = null
        )
        {
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
                    var log = context.InstanceServices.GetService<ILogger>();
                    var request = await context.GetHttpRequestDataAsync() ?? throw new ArgumentNullException("HTTP Request is null");

                    //TODO: check all exceptions thrown
                    try
                    {
                        // Checking that it is DfMon's Function
                        var operationKind = TryGetDfmOperationKind(context, log);

                        if (operationKind.HasValue)
                        {
                            // If so, invoking DfMon's auth logic
                            var dfmMode = Auth.ValidateIdentityAsync(request, operationKind.Value);

                            // Propagating DfmMode to Functions
                            context.Items.Add(Globals.DfmModeContextValue, DfmMode.Normal);
                        }

                        await next();
                    }
                    catch (DfmUnauthorizedException ex)
                    {
                        log.LogError(ex, "DFM failed to authenticate request");
                        context.GetInvocationResult().Value = request.CreateResponse(HttpStatusCode.Unauthorized);
                    }
                    catch (DfmAccessViolationException ex)
                    {
                        log.LogError(ex, "DFM failed to authorize request");
                        context.GetInvocationResult().Value = request.CreateResponse(HttpStatusCode.Forbidden);
                    }
                }
             );

            return builder;
        }

        /// <summary>
        /// Configures Durable Functions Monitor endpoint
        /// </summary>
        public static IHostBuilder UseDurableFunctionsMonitor(this IHostBuilder hostBuilder, Action<DfmSettings> options = null)
        {
            return hostBuilder.ConfigureFunctionsWorkerDefaults((HostBuilderContext builderContext, IFunctionsWorkerApplicationBuilder builder) =>
            {
                builder.UseDurableFunctionsMonitor(builderContext, options);
            });
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