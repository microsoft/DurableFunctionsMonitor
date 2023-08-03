// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json.Linq;
using Microsoft.WindowsAzure.Storage.Table;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.DurableTask;
using Microsoft.DurableTask.Client;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;
using Fluid;
using Fluid.Values;
using Microsoft.DurableTask;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class Orchestration : DfmFunctionBase
    {
        public Orchestration(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : base(dfmSettings, extensionPoints) 
        { 
            this._logger = loggerFactory.CreateLogger<Orchestration>();
        }

        // Handles orchestration instance operations.
        // GET /a/p/i/{connName}-{hubName}/orchestrations('<id>')
        [Function(nameof(DfmGetOrchestrationFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName,
            string instanceId)
        {
            var metadata = await durableClient.GetInstanceAsync(instanceId, true);
            if (metadata == null)
            {
                var notFoundResult = req.CreateResponse(HttpStatusCode.NotFound);
                notFoundResult.WriteString($"Instance {instanceId} doesn't exist");
                return notFoundResult;
            }

            var detailedStatus = await DetailedOrchestrationStatus.CreateFrom(
                new DurableOrchestrationStatus(metadata), 
                durableClient, 
                connName, 
                hubName, 
                this._logger, 
                this.Settings,
                this.ExtensionPoints
            );

            return await req.ReturnJson(detailedStatus, Globals.FixUndefinedsInJson);
        }

        // Handles orchestration instance operations.
        // GET /a/p/i/{connName}-{hubName}/orchestrations('<id>')/history
        [Function(nameof(DfmGetOrchestrationHistoryFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetOrchestrationHistoryFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/history")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName,
            string instanceId)
        {
            var filterClause = new FilterClause(req.Query["$filter"]);
            HistoryEvent[] history;
            int? totalCount = null;
            
            var connEnvVariableName = Globals.GetFullConnectionStringEnvVariableName(connName);

            history = (await this.ExtensionPoints.GetInstanceHistoryRoutine(durableClient, connEnvVariableName, hubName, instanceId))
                .ApplyTimeFrom(filterClause.TimeFrom)
                .ApplyFilter(filterClause)
                .ApplySkip(req.Query)
                .ApplyTop(req.Query)
                .ToArray();

            string json = JsonConvert.SerializeObject(new { totalCount, history }, HistorySerializerSettings);

            var response = req.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", "application/json");
            await response.WriteStringAsync(json);

            return response;
        }

        // Starts a new orchestration instance.
        // POST /a/p/i/{connName}-{hubName}/orchestrations
        [Function(nameof(DfmStartNewOrchestrationFunction))]
        [OperationKind(Kind = OperationKind.Write)]
        public async Task<HttpResponseData> DfmStartNewOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName)
        {
            string bodyString = await req.ReadAsStringAsync();
            dynamic body = JObject.Parse(bodyString);

            string orchestratorFunctionName = body.name;
            string instanceId = string.IsNullOrEmpty((string)body.id) ? null : (string)body.id;

            // ScheduleNewOrchestrationInstanceAsync() misunderstands JObject as input (converts all properties into empty arrays)
            // Dictionary<string, object> works better. So this is the workaround for that.
            var dataAsDictionary = JsonConvert.DeserializeObject<Dictionary<string, object>>(
                JsonConvert.SerializeObject(body.data)
            );

            instanceId = await durableClient.ScheduleNewOrchestrationInstanceAsync(
                orchestratorFunctionName,
                dataAsDictionary,
                new StartOrchestrationOptions(instanceId)
            );

            return await req.ReturnJson(new { instanceId });
        }

        // Handles orchestration instance operations.
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/purge
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/rewind
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/terminate
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/raise-event
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/set-custom-status
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/restart
        [Function(nameof(DfmPostOrchestrationFunction))]
        [OperationKind(Kind = OperationKind.Write)]
        public async Task<HttpResponseData> DfmPostOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/{action?}")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName,
            string instanceId,
            string action)
        {
            string bodyString = await req.ReadAsStringAsync();

            switch (action)
            {
                case "suspend":
                    await durableClient.SuspendInstanceAsync(instanceId, bodyString);
                    break;
                case "resume":
                    await durableClient.ResumeInstanceAsync(instanceId, bodyString);
                    break;
                case "purge":
                    await durableClient.PurgeInstanceAsync(instanceId);
                    break;
                case "rewind":
                    return req.ReturnStatus(HttpStatusCode.BadRequest, "Rewind is not supported in Isolated mode");
                case "terminate":
                    await durableClient.TerminateInstanceAsync(instanceId, bodyString);
                    break;
                case "raise-event":

                    dynamic bodyObject = JObject.Parse(bodyString);
                    string eventName = bodyObject.name;
                    JObject eventData = bodyObject.data;

                    //TODO: check what happens when raising an event to an entity
                    await durableClient.RaiseEventAsync(instanceId, eventName, eventData);

                    break;
                case "set-custom-status":

                    // Updating the table directly, as there is no other known way
                    var tableClient = await TableClient.GetTableClient(Globals.GetFullConnectionStringEnvVariableName(connName));
                    string tableName = $"{durableClient.Name}Instances";

                    var orcEntity = (await tableClient.ExecuteAsync(tableName, TableOperation.Retrieve(instanceId, string.Empty))).Result as DynamicTableEntity;

                    if (string.IsNullOrEmpty(bodyString))
                    {
                        orcEntity.Properties.Remove("CustomStatus");
                    }
                    else
                    {
                        // Ensuring that it is at least a valid JSON
                        string customStatus = JObject.Parse(bodyString).ToString();
                        orcEntity.Properties["CustomStatus"] = new EntityProperty(customStatus);
                    }

                    await tableClient.ExecuteAsync(tableName, TableOperation.Replace(orcEntity));

                    break;
                case "restart":
                    return req.ReturnStatus(HttpStatusCode.BadRequest, "Restart is not supported in Isolated mode");
                default:
                    return req.ReturnStatus(HttpStatusCode.NotFound);
            }

            return req.ReturnStatus(HttpStatusCode.OK);
        }

        // Renders a custom tab liquid template for this instance and returns the resulting HTML.
        // Why is it POST and not GET? Exactly: because we don't want to allow to navigate to this page directly (bypassing Content Security Policies)
        // POST /a/p/i{connName}-{hubName}//orchestrations('<id>')/custom-tab-markup
        [Function(nameof(DfmGetOrchestrationTabMarkupFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public async Task<HttpResponseData> DfmGetOrchestrationTabMarkupFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/custom-tab-markup('{templateName}')")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName,
            string instanceId,
            string templateName)
        {
            var metadata = await durableClient.GetInstancesAsync(instanceId, true);
            if (metadata == null)
            {
                return req.ReturnStatus(HttpStatusCode.NotFound, $"Instance {instanceId} doesn't exist");
            }

            //TODO: load history for markup rendering
            var status = await DetailedOrchestrationStatus.CreateFrom(
                new DurableOrchestrationStatus(metadata), 
                durableClient, 
                connName, 
                hubName, 
                this._logger, 
                this.Settings,
                this.ExtensionPoints
            );

            // The underlying Task never throws, so it's OK.
            var templatesMap = await CustomTemplates.GetTabTemplatesAsync(this.Settings);

            string templateCode = templatesMap.GetTemplate(status.GetEntityTypeName(), templateName);
            if (templateCode == null)
            {
                return req.ReturnStatus(HttpStatusCode.NotFound, "The specified template doesn't exist");
            }

            try
            {
                var fluidTemplate = new FluidParser().Parse(templateCode);

                var options = new TemplateOptions();
                options.MemberAccessStrategy.Register<JObject, object>((obj, fieldName) => obj[fieldName]);
                options.ValueConverters.Add(x => x is JObject obj ? new ObjectValue(obj) : null);
                options.ValueConverters.Add(x => x is JValue val ? val.Value : null);

                string fluidResult = fluidTemplate.Render(new TemplateContext(status, options));

                var response = req.CreateResponse(HttpStatusCode.OK);
                response.Headers.Add("Content-Type", "text/html; charset=UTF-8");
                await response.WriteStringAsync(fluidResult);

                return response;
            }
            catch (Exception ex)
            {
                return req.ReturnStatus(HttpStatusCode.BadRequest, ex.Message);
            }
        }

        private static readonly string[] SubOrchestrationEventTypes = new[]
        {
            "SubOrchestrationInstanceCreated",
            "SubOrchestrationInstanceCompleted",
            "SubOrchestrationInstanceFailed",
        };

        private readonly ILogger _logger;

        // Need special serializer settings for execution history, to match the way it was originally serialized
        private static JsonSerializerSettings HistorySerializerSettings = new JsonSerializerSettings
        {
            Formatting = Formatting.Indented,
            DateFormatString = "yyyy-MM-ddTHH:mm:ss.FFFFFFFZ"
        };

        private static void ConvertScheduledTime(JArray history)
        {
            if (history == null)
            {
                return;
            }

            var orchestrationStartedEvent = history.FirstOrDefault(h => h.Value<string>("EventType") == "ExecutionStarted");

            foreach (var e in history)
            {
                if (e["ScheduledTime"] != null)
                {
                    // Converting to UTC and explicitly formatting as a string (otherwise default serializer outputs it as a local time)
                    var scheduledTime = e.Value<DateTime>("ScheduledTime").ToUniversalTime();
                    e["ScheduledTime"] = scheduledTime.ToString("o");

                    // Also adding DurationInMs field
                    var timestamp = e.Value<DateTime>("Timestamp").ToUniversalTime();
                    var duration = timestamp - scheduledTime;
                    e["DurationInMs"] = duration.TotalMilliseconds;
                }

                // Also adding duration of the whole orchestration
                if (e.Value<string>("EventType") == "ExecutionCompleted" && orchestrationStartedEvent != null)
                {
                    var scheduledTime = orchestrationStartedEvent.Value<DateTime>("Timestamp").ToUniversalTime();
                    var timestamp = e.Value<DateTime>("Timestamp").ToUniversalTime();
                    var duration = timestamp - scheduledTime;
                    e["DurationInMs"] = duration.TotalMilliseconds;
                }
            }
        }
    }
}