// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json.Linq;
using System;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using Microsoft.WindowsAzure.Storage.Table;
using System.Linq;
using Microsoft.Extensions.Logging;
using Fluid;
using Fluid.Values;
using Newtonsoft.Json;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;
using System.IO;
using System.IO.Compression;
using Microsoft.WindowsAzure.Storage;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class Orchestration: HttpHandlerBase
    {
        public Orchestration(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Handles orchestration instance operations.
        // GET /a/p/i/{connName}-{hubName}/orchestrations('<id>')
        [FunctionName(nameof(DfmGetOrchestrationFunction))]
        public Task<IActionResult> DfmGetOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            string instanceId,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Read, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                var status = await durableClient.GetStatusAsync(instanceId, false, false, true);
                if (status == null)
                {
                    return new NotFoundObjectResult($"Instance {instanceId} doesn't exist");
                }

                var detailedStatus = await DetailedOrchestrationStatus.CreateFrom(status, durableClient, connName, hubName, log);

                return detailedStatus.ToJsonContentResult(Globals.FixUndefinedsInJson);
            });
        }

        // Handles orchestration instance operations.
        // GET /a/p/i/{connName}-{hubName}/orchestrations('<id>')/history
        [FunctionName(nameof(DfmGetOrchestrationHistoryFunction))]
        public Task<IActionResult> DfmGetOrchestrationHistoryFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/history")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            string instanceId,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Read, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                var filterClause = new FilterClause(req.Query["$filter"]);
                HistoryEvent[] history;
                int? totalCount = null;
                
                try
                {
                    var connEnvVariableName = Globals.GetFullConnectionStringEnvVariableName(connName);

                    history = (await DfmEndpoint.ExtensionPoints.GetInstanceHistoryRoutine(durableClient, connEnvVariableName, hubName, instanceId))

                        // This code duplication is intentional. We need to keep the whole iteration process inside try-block, because of potential exceptions during it.

                        .ApplyTimeFrom(filterClause.TimeFrom)
                        .ApplyFilter(filterClause)
                        .ApplySkip(req.Query)
                        .ApplyTop(req.Query)
                        .ToArray();
                }
                catch (Exception ex)
                {
                    log.LogWarning(ex, "Failed to get execution history from storage, falling back to DurableClient");

                    // Falling back to DurableClient
                    var status = await GetInstanceStatusWithHistory(connName, hubName, instanceId, durableClient, log);
                    if (status == null)
                    {
                        return new NotFoundObjectResult($"Instance {instanceId} doesn't exist");
                    }

                    var historyJArray = status.History == null ? new JArray() : status.History;
                    totalCount = historyJArray.Count;

                    history = historyJArray
                        .Select(OrchestrationHistory.ToHistoryEvent)
                        .ApplyTimeFrom(filterClause.TimeFrom)
                        .ApplyFilter(filterClause)
                        .ApplySkip(req.Query)
                        .ApplyTop(req.Query)
                        .ToArray();
                }

                return new ContentResult()
                {
                    Content = JsonConvert.SerializeObject( new { totalCount, history }, HistorySerializerSettings),
                    ContentType = "application/json"
                };
            });
        }

        // Starts a new orchestration instance.
        // POST /a/p/i/{connName}-{hubName}/orchestrations
        [FunctionName(nameof(DfmStartNewOrchestrationFunction))]
        public Task<IActionResult> DfmStartNewOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Write, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                string bodyString = await req.ReadAsStringAsync();
                dynamic body = JObject.Parse(bodyString);

                string orchestratorFunctionName = body.name;
                string instanceId = body.id;

                instanceId = await durableClient.StartNewAsync(orchestratorFunctionName, instanceId, body.data);

                return new { instanceId }.ToJsonContentResult(Globals.FixUndefinedsInJson);
            });
        }

        // Handles orchestration instance operations.
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/purge
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/rewind
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/terminate
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/raise-event
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/set-custom-status
        // POST /a/p/i/{connName}-{hubName}/orchestrations('<id>')/restart
        [FunctionName(nameof(DfmPostOrchestrationFunction))]
        public Task<IActionResult> DfmPostOrchestrationFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/{action?}")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            string instanceId,
            string action,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Write, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                string bodyString = await req.ReadAsStringAsync();

                switch (action)
                {
                    case "suspend":
                        await durableClient.SuspendAsync(instanceId, bodyString);
                        break;
                    case "resume":
                        await durableClient.ResumeAsync(instanceId, bodyString);
                        break;
                    case "purge":
                        await durableClient.PurgeInstanceHistoryAsync(instanceId);
                        break;
                    case "rewind":
                        await durableClient.RewindAsync(instanceId, bodyString);
                        break;
                    case "terminate":
                        await durableClient.TerminateAsync(instanceId, bodyString);
                        break;
                    case "raise-event":

                        dynamic bodyObject = JObject.Parse(bodyString);
                        string eventName = bodyObject.name;
                        JObject eventData = bodyObject.data;

                        var match = ExpandedOrchestrationStatus.EntityIdRegex.Match(instanceId);
                        // if this looks like an Entity
                        if(match.Success)
                        {
                            // then sending signal
                            var entityId = new EntityId(match.Groups[1].Value, match.Groups[2].Value);

                            await durableClient.SignalEntityAsync(entityId, eventName, eventData);
                        }
                        else 
                        {
                            // otherwise raising event
                            await durableClient.RaiseEventAsync(instanceId, eventName, eventData);
                        }

                        break;
                    case "set-custom-status":

                        // Updating the table directly, as there is no other known way
                        var tableClient = await TableClient.GetTableClient(Globals.GetFullConnectionStringEnvVariableName(connName));
                        string tableName = $"{durableClient.TaskHubName}Instances";

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
                        bool restartWithNewInstanceId = ((dynamic)JObject.Parse(bodyString)).restartWithNewInstanceId;

                        await durableClient.RestartAsync(instanceId, restartWithNewInstanceId);
                        break;

                    case "input":

                        return await this.DownloadFieldValue(durableClient, Globals.GetFullConnectionStringEnvVariableName(connName), instanceId, status => status.Input.ToString());

                    case "output":

                        return await this.DownloadFieldValue(durableClient, Globals.GetFullConnectionStringEnvVariableName(connName), instanceId, status => status.Output.ToString());

                    case "custom-status":

                        return await this.DownloadFieldValue(durableClient, Globals.GetFullConnectionStringEnvVariableName(connName), instanceId, status => status.CustomStatus.ToString());

                    default:
                        return new NotFoundResult();
                }

                return new OkResult();
            });
        }

        // Renders a custom tab liquid template for this instance and returns the resulting HTML.
        // Why is it POST and not GET? Exactly: because we don't want to allow to navigate to this page directly (bypassing Content Security Policies)
        // POST /a/p/i{connName}-{hubName}//orchestrations('<id>')/custom-tab-markup
        [FunctionName(nameof(DfmGetOrchestrationTabMarkupFunction))]
        public Task<IActionResult> DfmGetOrchestrationTabMarkupFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = Globals.ApiRoutePrefix + "/orchestrations('{instanceId}')/custom-tab-markup('{templateName}')")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            string instanceId,
            string templateName,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Read, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

                var status = await GetInstanceStatusWithHistory(connName, hubName, instanceId, durableClient, log);
                if (status == null)
                {
                    return new NotFoundObjectResult($"Instance {instanceId} doesn't exist");
                }

                // The underlying Task never throws, so it's OK.
                var templatesMap = await CustomTemplates.GetTabTemplatesAsync();

                string templateCode = templatesMap.GetTemplate(status.GetEntityTypeName(), templateName);
                if (templateCode == null)
                {
                    return new NotFoundObjectResult("The specified template doesn't exist");
                }

                try
                {
                    var fluidTemplate = new FluidParser().Parse(templateCode);

                    var options = new TemplateOptions();
                    options.MemberAccessStrategy.Register<JObject, object>((obj, fieldName) => obj[fieldName]);
                    options.ValueConverters.Add(x => x is JObject obj ? new ObjectValue(obj) : null);
                    options.ValueConverters.Add(x => x is JValue val ? val.Value : null);

                    string fluidResult = fluidTemplate.Render(new TemplateContext(status, options));

                    return new ContentResult()
                    {
                        Content = fluidResult,
                        ContentType = "text/html; charset=UTF-8"
                    };
                }
                catch (Exception ex)
                {
                    return new BadRequestObjectResult(ex.Message);
                }
            });
        }

        private static readonly string[] SubOrchestrationEventTypes = new[]
        {
            "SubOrchestrationInstanceCreated",
            "SubOrchestrationInstanceCompleted",
            "SubOrchestrationInstanceFailed",
        };

        // Need special serializer settings for execution history, to match the way it was originally serialized
        private static JsonSerializerSettings HistorySerializerSettings = new JsonSerializerSettings
        {
            Formatting = Formatting.Indented,
            DateFormatString = "yyyy-MM-ddTHH:mm:ss.FFFFFFFZ"
        };

        private static async Task<DetailedOrchestrationStatus> GetInstanceStatusWithHistory(string connName, string hubName, string instanceId, IDurableClient durableClient, ILogger log)
        {
            var status = await durableClient.GetStatusAsync(instanceId, true, true, true);
            if (status == null)
            {
                return null;
            }

            ConvertScheduledTime(status.History);

            var detailedStatus = await DetailedOrchestrationStatus.CreateFrom(status, durableClient, connName, hubName, log);

            return detailedStatus;
        }

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

        private void CheckBlobUrl(string blobUrl, StorageUri storageUri)
        {
            blobUrl = blobUrl.ToLower();

            string primaryUri = storageUri.PrimaryUri.ToString().ToLower();
            string secondaryUri = storageUri.SecondaryUri?.ToString().ToLower();
            if (string.IsNullOrEmpty(secondaryUri))
            {
                secondaryUri = primaryUri;
            }

            if (!blobUrl.StartsWith(primaryUri) && !blobUrl.StartsWith(secondaryUri))
            {
                throw new NotSupportedException("The field value is not a valid blob URL");
            }
        }

        private async Task<IActionResult> DownloadFieldValue(IDurableClient durableClient, 
            string connEnvVariableName, 
            string instanceId, 
            Func<DurableOrchestrationStatus, string> fieldGetter)
        {
            var status = await durableClient.GetStatusAsync(instanceId);
            if (status == null)
            {
                return new NotFoundObjectResult($"Instance {instanceId} doesn't exist");
            }

            string blobUrl = fieldGetter(status);

            var blobClient = await Globals.GetCloudBlobClient(connEnvVariableName);

            // Important check, to make sure we're not trying to access anything other than our own blob storage
            this.CheckBlobUrl(blobUrl, blobClient.StorageUri);

            var blob = await blobClient.GetBlobReferenceFromServerAsync(new Uri(blobUrl));

            using (var memoryStream = new MemoryStream())
            {
                await blob.DownloadToStreamAsync(memoryStream);
                memoryStream.Position = 0;
                
                using (var gzipStream = new GZipStream(memoryStream, CompressionMode.Decompress))
                using (var streamReader = new StreamReader(gzipStream))
                {
                    string data = await streamReader.ReadToEndAsync();

                    // If it looks like JSON
                    if (data[0] == '{')
                    {
                        return new ContentResult() { Content = data, ContentType = "application/json" };
                    }

                    // If it looks like a base64 string
                    if (data[0] == '"')
                    {
                        try
                        {
                            var bytes = Convert.FromBase64String(data[1..^1]);

                            return new FileContentResult(bytes, "application/octet-stream");
                        }
                        catch (Exception)
                        {
                            // Let's think it is just a plain string
                        }
                    }

                    // Otherwise just returning it as text
                    return new ContentResult() { Content = data, ContentType = "text/plain" };
                }
            }
        }
    }
}