// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Linq.Expressions;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using System.Threading;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public class Orchestrations: HttpHandlerBase
    {
        public Orchestrations(IDurableClientFactory durableClientFactory): base(durableClientFactory) {}

        // Adds sorting, paging and filtering capabilities around /runtime/webhooks/durabletask/instances endpoint.
        // GET /a/p/i{connName}-{hubName}/orchestrations?$filter=<filter>&$orderby=<order-by>&$skip=<m>&$top=<n>
        [FunctionName(nameof(DfmGetOrchestrationsFunction))]
        public Task<IActionResult> DfmGetOrchestrationsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.ApiRoutePrefix + "/orchestrations")] HttpRequest req,
            [DurableClient(TaskHub = Globals.HubNameRouteParamName)] IDurableClient defaultDurableClient,
            string connName,
            string hubName,
            ILogger log)
        {
            return this.HandleAuthAndErrors(OperationKind.Read, defaultDurableClient, req, connName, hubName, log, async (durableClient) => {

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
                    .ExpandStatus(durableClient, connName, filterClause, hiddenColumns)
                    .ApplyRuntimeStatusesFilter(filterClause.RuntimeStatuses)
                    .ApplyFilter(filterClause)
                    .ApplyOrderBy(req.Query)
                    .ApplySkip(req.Query)
                    .ApplyTop(req.Query);

                return orchestrations.ToJsonContentResult(Globals.FixUndefinedsInJson);
            });
        }
    }

    internal static class ExtensionMethodsForOrchestrations
    {
        // Adds artificial fields ('lastEvent' and 'parentInstanceId') fields to each entity, when needed
        internal static IEnumerable<ExpandedOrchestrationStatus> ExpandStatus(this IEnumerable<DurableOrchestrationStatus> orchestrations,
            IDurableClient client, string connName, FilterClause filterClause, HashSet<string> hiddenColumns)
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
                    // Only loading history when being filtered by lastEvent
                    filterClause.FieldName == "lastEvent" ? client.GetStatusAsync(orchestration.InstanceId, true, false, false) : null,
                    // Only loading parentInstanceId when being filtered by it
                    filterClause.FieldName == "parentInstanceId" ? DfmEndpoint.ExtensionPoints.GetParentInstanceIdRoutine(client, connEnvVariableName, client.TaskHubName, orchestration.InstanceId) : null,
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
            IQueryCollection query)
        {
            var clause = query["$orderby"];
            if (!clause.Any())
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
        internal static IEnumerable<DurableOrchestrationStatus> ListAllInstances(this IDurableClient durableClient, DateTime? timeFrom, DateTime? timeTill, bool showInput, string[] statuses)
        {
            var queryCondition = new OrchestrationStatusQueryCondition()
            {
                PageSize = ListInstancesPageSize,
                ShowInput = showInput
            };

            if (timeFrom.HasValue)
            {
                queryCondition.CreatedTimeFrom = timeFrom.Value;
            }
            if (timeTill.HasValue)
            {
                queryCondition.CreatedTimeTo = timeTill.Value;
            }

            if (statuses != null)
            {
                var runtimeStatuses = statuses.ToRuntimeStatuses().ToList();

                // Durable Entities are always 'Running'
                if (statuses.Contains(DurableEntityRuntimeStatus, StringComparer.OrdinalIgnoreCase))
                {
                    runtimeStatuses.Add(OrchestrationRuntimeStatus.Running);
                }

                queryCondition.RuntimeStatus = runtimeStatuses;
            }

            OrchestrationStatusQueryResult response = null;
            do
            {
                queryCondition.ContinuationToken = response == null ? null : response.ContinuationToken;

                response = durableClient.ListInstancesAsync(queryCondition, CancellationToken.None).Result;
                foreach (var item in response.DurableOrchestrationState)
                {
                    yield return item;
                }
            }
            while (!string.IsNullOrEmpty(response.ContinuationToken));
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
