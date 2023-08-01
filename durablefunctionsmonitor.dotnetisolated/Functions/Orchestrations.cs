// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Reflection;
using System.Linq.Expressions;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.DurableTask.Client;
using System.Collections.Specialized;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public static class Orchestrations
    {
        // Adds sorting, paging and filtering capabilities around /runtime/webhooks/durabletask/instances endpoint.
        // GET /a/p/i{connName}-{hubName}/orchestrations?$filter=<filter>&$orderby=<order-by>&$skip=<m>&$top=<n>
        [Function(nameof(DfmGetOrchestrationsFunction))]
        [OperationKind(Kind = OperationKind.Read)]
        public static Task<HttpResponseData> DfmGetOrchestrationsFunction(
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
                .ExpandStatus(durableClient, connName, hubName, filterClause, hiddenColumns)
                .ApplyRuntimeStatusesFilter(filterClause.RuntimeStatuses)
                .ApplyFilter(filterClause)
                .ApplyOrderBy(req.Query)
                .ApplySkip(req.Query)
                .ApplyTop(req.Query);

            return req.ReturnJson(orchestrations, Globals.FixUndefinedsInJson);
        }
    }

    internal static class ExtensionMethodsForOrchestrations
    {
        // Adds artificial fields ('lastEvent' and 'parentInstanceId') fields to each entity, when needed
        internal static IEnumerable<ExpandedOrchestrationStatus> ExpandStatus(this IEnumerable<DurableOrchestrationStatus> orchestrations,
            DurableTaskClient client, string connName, string hubName, FilterClause filterClause, HashSet<string> hiddenColumns)
        {
            var connEnvVariableName = Globals.GetFullConnectionStringEnvVariableName(connName);

            // Iterating through the stream in batches of this size
            var parallelizationLevel = 256;
            var buf = new List<ExpandedOrchestrationStatus>();

            foreach (var orchestration in orchestrations)
            {
                var expandedStatus = new ExpandedOrchestrationStatus
                (
                    orchestration,
                    // Only loading parentInstanceId when being filtered by it
                    filterClause.FieldName == "parentInstanceId" ? DfmEndpoint.ExtensionPoints.GetParentInstanceIdRoutine(client, connEnvVariableName, hubName, orchestration.InstanceId) : null,
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

        // Intentionally NOT using async/await here, because we need yield return.
        // The magic is to only load all the pages, when it is really needed (e.g. when sorting is used).
        internal static IEnumerable<DurableOrchestrationStatus> ListAllInstances(this DurableTaskClient durableClient, DateTime? timeFrom, DateTime? timeTill, bool showInput, string[] statuses)
        {
            List<OrchestrationRuntimeStatus> runtimeStatuses = null;

            if (statuses != null)
            {
                runtimeStatuses = statuses.ToRuntimeStatuses().ToList();

                // Durable Entities are always 'Running'
                if (statuses.Contains(DurableEntityRuntimeStatus, StringComparer.OrdinalIgnoreCase))
                {
                    runtimeStatuses.Add(OrchestrationRuntimeStatus.Running);
                }
            }

            var queryCondition = new OrchestrationQuery()
            {
                PageSize = ListInstancesPageSize,
                FetchInputsAndOutputs = showInput,
                CreatedFrom = timeFrom.HasValue ? timeFrom.Value : null,
                CreatedTo = timeTill.HasValue ? timeTill.Value : null,
                Statuses = runtimeStatuses
            };

            //TODO: try to speed up ToBlockingEnumerable()
            return durableClient.GetAllInstancesAsync(queryCondition)
                .ToBlockingEnumerable()
                .Select(instance => new DurableOrchestrationStatus(instance));
        }

        // Some reasonable page size for ListInstancesAsync
        private const int ListInstancesPageSize = 500;

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
