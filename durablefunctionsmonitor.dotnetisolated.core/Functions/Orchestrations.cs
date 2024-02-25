// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Reflection;
using System.Linq.Expressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask.Client;
using Microsoft.Extensions.Logging;
using System.Collections.Specialized;
using Microsoft.DurableTask.Client.Entities;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class Orchestrations : DfmFunctionBase
    {
        public Orchestrations(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : base(dfmSettings, extensionPoints) 
        { 
            this._logger = loggerFactory.CreateLogger<Orchestrations>();
        }
        
        // Adds sorting, paging and filtering capabilities around /runtime/webhooks/durabletask/instances endpoint.
        // GET /a/p/i{connName}-{hubName}/orchestrations?$filter=<filter>&$orderby=<order-by>&$skip=<m>&$top=<n>
        [Function(nameof(DfmGetOrchestrationsFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public Task<HttpResponseData> DfmGetOrchestrationsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations")] HttpRequestData req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] DurableTaskClient durableClient,
            string connName,
            string hubName)
        {
            var filterClause = new FilterClause(req.Query["$filter"]);

            string hiddenColumnsString = req.Query["hidden-columns"];
            var hiddenColumns = string.IsNullOrEmpty(hiddenColumnsString) ? new HashSet<string>() : new HashSet<string>(hiddenColumnsString.Split('|'));

            // Filtered column should always be returned
            if(!string.IsNullOrEmpty(filterClause.FieldName))
            {
                hiddenColumns.Remove(filterClause.FieldName);
            }

            var orchestrations = durableClient
                .ListAllInstances(filterClause.TimeFrom, filterClause.TimeTill, !hiddenColumns.Contains("input"), filterClause.RuntimeStatuses)
                .ExpandStatus(durableClient, connName, hubName, filterClause, hiddenColumns, this.ExtensionPoints)
                .ListDurableEntities(durableClient, filterClause.TimeFrom, filterClause.TimeTill, filterClause.RuntimeStatuses, hiddenColumns, this._logger)
                .ApplyRuntimeStatusesFilter(filterClause.RuntimeStatuses)
                .ApplyFilter(filterClause)
                .ApplyOrderBy(req.Query)
                .ApplySkip(req.Query)
                .ApplyTop(req.Query);

            return req.ReturnJson(orchestrations, Globals.FixUndefinedsInJson);
        }

        private readonly ILogger _logger;
    }

    internal static class ExtensionMethodsForOrchestrations
    {
        // Adds artificial fields ('lastEvent' and 'parentInstanceId') fields to each entity, when needed
        internal static IEnumerable<ExpandedOrchestrationStatus> ExpandStatus(this IAsyncEnumerable<OrchestrationMetadata> asyncEnumerable,
            DurableTaskClient client, string connName, string hubName, FilterClause filterClause, HashSet<string> hiddenColumns, DfmExtensionPoints extensionPoints)
        {
            var connEnvVariableName = Globals.GetFullConnectionStringEnvVariableName(connName);

            // Iterating through the stream in batches of this size
            var parallelizationLevel = ListInstancesPageSize;
            var buf = new List<ExpandedOrchestrationStatus>();

            var asyncEnumerator = asyncEnumerable.GetAsyncEnumerator();
            try
            {
                while (asyncEnumerator.MoveNextAsync().AsTask().Result)
                {
                    var orchestration = new DurableOrchestrationStatus(asyncEnumerator.Current);

                    var expandedStatus = new ExpandedOrchestrationStatus
                    (
                        orchestration,
                        // Only loading parentInstanceId when being filtered by it
                        filterClause.FieldName == "parentInstanceId" ? extensionPoints.GetParentInstanceIdRoutine(client, connEnvVariableName, hubName, orchestration.InstanceId) : null,
                        hiddenColumns
                    );

                    buf.Add(expandedStatus);

                    if (buf.Count >= parallelizationLevel)
                    {
                        foreach(var item in buf)
                        {
                            yield return item;
                        }

                        buf.Clear();
                    }
                }
            }
            finally
            {
                asyncEnumerator.DisposeAsync().AsTask().Wait();
            }

            foreach(var item in buf)
            {
                yield return item;
            }
        }

        internal static IEnumerable<ExpandedOrchestrationStatus> ApplyOrderBy(this IEnumerable<ExpandedOrchestrationStatus> orchestrations,
            NameValueCollection query)
        {
            var clause = query["$orderby"];
            if (string.IsNullOrEmpty(clause))
            {
                return orchestrations;
            }

            var orderByParts = clause.ToString().Split(' ');
            bool desc = string.Equals("desc", orderByParts.Skip(1).FirstOrDefault(), StringComparison.OrdinalIgnoreCase);

            return orchestrations.OrderBy(orderByParts[0], desc);
        }

        // OrderBy that takes property name as a string (instead of an expression)
        internal static IEnumerable<T> OrderBy<T>(this IEnumerable<T> sequence, string fieldName, bool desc)
        {
            var paramExpression = Expression.Parameter(typeof(T));
            Expression fieldAccessExpression;
            
            try
            {
                fieldAccessExpression = Expression.PropertyOrField(paramExpression, fieldName);
            }
            catch (Exception)
            {
                // If field is invalid, returning original enumerable
                return sequence;
            }

            var genericParamType = fieldAccessExpression.Type;

            if (!genericParamType.IsPrimitive && genericParamType != typeof(string) && genericParamType != typeof(DateTime) && genericParamType != typeof(DateTimeOffset))
            {
                // If this is a complex object field, then sorting by it's string representation
                fieldAccessExpression = Expression.Call(fieldAccessExpression, ToStringMethodInfo);
                genericParamType = typeof(string);
            }

            var methodInfo = (desc ? OrderByDescMethodInfo : OrderByMethodInfo)
                .MakeGenericMethod(typeof(T), genericParamType);

            return (IEnumerable<T>)methodInfo.Invoke(null, new object[] {
                sequence,
                Expression.Lambda(fieldAccessExpression, paramExpression).Compile()
            });
        }

        internal static IEnumerable<ExpandedOrchestrationStatus> ApplyRuntimeStatusesFilter(this IEnumerable<ExpandedOrchestrationStatus> orchestrations,
            string[] statuses)
        {
            if (statuses == null)
            {
                return orchestrations;
            }

            bool includeDurableEntities = statuses.Contains(DurableEntityRuntimeStatus, StringComparer.OrdinalIgnoreCase);
            var runtimeStatuses = statuses.ToRuntimeStatuses().ToArray();

            return orchestrations.Where(o => {

                if (o.EntityType == EntityTypeEnum.DurableEntity)
                {
                    return includeDurableEntities;
                }
                else 
                {
                    return runtimeStatuses.Contains(o.RuntimeStatus);
                }
            });
        }

        // Fetches orchestration instances
        internal static IAsyncEnumerable<OrchestrationMetadata> ListAllInstances(this DurableTaskClient durableClient, DateTime? timeFrom, DateTime? timeTill, bool showInput, string[] statuses)
        {
            var queryCondition = new OrchestrationQuery()
            {
                PageSize = ListInstancesPageSize,
                FetchInputsAndOutputs = showInput,
                CreatedFrom = timeFrom.HasValue ? timeFrom.Value : null,
                CreatedTo = timeTill.HasValue ? timeTill.Value : null,
                Statuses = statuses?.ToRuntimeStatuses().ToList()
            };

            return durableClient.GetAllInstancesAsync(queryCondition);
        }

        // Fetches and adds Durable Entities to the dataset (needs to be done separately, since there's now a separate method for fetching them)
        // Again, we need to do it sequentially, so that the actual fetch only happens on demand.
        internal static IEnumerable<ExpandedOrchestrationStatus> ListDurableEntities(this IEnumerable<ExpandedOrchestrationStatus> orchestrations, 
            DurableTaskClient client, DateTime? timeFrom, DateTime? timeTill, string[] statuses, HashSet<string> hiddenColumns, ILogger log)
        {
            foreach (var orch in orchestrations)
            {
                yield return orch;
            }

            if (statuses != null && !statuses.Contains(DurableEntityRuntimeStatus, StringComparer.OrdinalIgnoreCase))
            {
                yield break;
            }

            IEnumerable<EntityMetadata> instances;
            try
            {
                var filter = new EntityQuery
                {
                    LastModifiedFrom = timeFrom.HasValue ? timeFrom.Value : null,
                    LastModifiedTo = timeTill.HasValue ? timeTill.Value : null,
                    IncludeState = true,
                    IncludeTransient = true
                };

                instances = client.Entities.GetAllEntitiesAsync(filter).ToBlockingEnumerable();
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, $"Failed to list Durable Entities");
                yield break;
            }

            foreach (var entityMetadata in instances)
            {
                yield return new ExpandedOrchestrationStatus(entityMetadata, hiddenColumns);
            }
        }

        // Some reasonable page size for ListInstancesAsync
        private const int ListInstancesPageSize = 1000;

        private const string DurableEntityRuntimeStatus = "DurableEntities";

        private static MethodInfo OrderByMethodInfo = typeof(Enumerable).GetMethods().First(m => m.Name == "OrderBy" && m.GetParameters().Length == 2);
        private static MethodInfo OrderByDescMethodInfo = typeof(Enumerable).GetMethods().First(m => m.Name == "OrderByDescending" && m.GetParameters().Length == 2);
        private static MethodInfo ToStringMethodInfo = ((Func<string>)new object().ToString).Method;

        private static IEnumerable<OrchestrationRuntimeStatus> ToRuntimeStatuses(this string[] statuses)
        {
            foreach(var s in statuses)
            {
                if (Enum.TryParse<OrchestrationRuntimeStatus>(s, true, out var runtimeStatus))
                {
                    yield return runtimeStatus;
                }
            }
        }
    }
}
