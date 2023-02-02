// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using DurableFunctionsMonitor.DotNetBackend;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using Microsoft.Azure.WebJobs.Hosting;
using Microsoft.Data.SqlClient;

[assembly: WebJobsStartup(typeof(Dfm.MsSql.Startup))]
namespace Dfm.MsSql
{
    public class Startup : IWebJobsStartup
    {
        public void Configure(IWebJobsBuilder builder)
        {
            DfmEndpoint.Setup(null, new DfmExtensionPoints 
            { 
                GetInstanceHistoryRoutine = (client, connName, hubName, instanceId) => Task.FromResult(GetInstanceHistory(client, connName, hubName, instanceId)),
                GetParentInstanceIdRoutine = GetParentInstanceId,
                GetTaskHubNamesRoutine = GetTaskHubNames
            });
        }

        /// <summary>
        /// Custom routine for fetching Task Hub names
        /// </summary>
        public static async Task<IEnumerable<string>> GetTaskHubNames(string connName)
        {
            var result = new List<string>();

            string sql =
                @"SELECT DISTINCT
                    i.TaskHub as TaskHub
                FROM
                    dt.Instances i";

            string sqlConnectionString = Environment.GetEnvironmentVariable("DFM_SQL_CONNECTION_STRING");

            using (var conn = new SqlConnection(sqlConnectionString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (await reader.ReadAsync())
                        {
                            result.Add(reader["TaskHub"].ToString());
                        }
                    }
                }
            }

            return result;
        }

        /// <summary>
        /// Custom routine for fetching parent orchestration id
        /// </summary>
        public static async Task<string> GetParentInstanceId(IDurableClient durableClient, string connName, string hubName, string instanceId)
        {
            string sql =
                @"SELECT 
                    i.ParentInstanceID as ParentInstanceID
                FROM
                    dt.Instances i
                    LEFT JOIN
                    dt.Instances i2
                    ON
                    (i2.InstanceID = i.InstanceID AND i2.TaskHub = @TaskHub)
                WHERE
                    i.InstanceID = @OrchestrationInstanceId AND i.TaskHub = IIF(i2.InstanceID IS NULL, 'dbo', @TaskHub)";

            string sqlConnectionString = Environment.GetEnvironmentVariable("DFM_SQL_CONNECTION_STRING");

            using (var conn = new SqlConnection(sqlConnectionString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@OrchestrationInstanceId", instanceId);
                    cmd.Parameters.AddWithValue("@TaskHub", hubName);
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        if (await reader.ReadAsync())
                        {
                            var parentInstanceId = reader["ParentInstanceID"];
                            if (parentInstanceId != null)
                            {
                                string parentInstanceIdString = parentInstanceId.ToString();
                                if (!string.IsNullOrWhiteSpace(parentInstanceIdString))
                                {
                                    return parentInstanceIdString;
                                }
                            }
                        }
                    }
                }
            }

            return null;
        }

        /// <summary>
        /// Custom routine for fetching orchestration history
        /// </summary>
        public static IEnumerable<HistoryEvent> GetInstanceHistory(IDurableClient durableClient, string connName, string hubName, string instanceId)
        {
            string sql =
                @"SELECT 
                    IIF(h2.TaskID IS NULL, h.Timestamp, h2.Timestamp) as Timestamp, 
                    IIF(h2.TaskID IS NULL, h.EventType, h2.EventType) as EventType,
                    h.TaskID as EventId,
                    h.Name as Name,
                    IIF(h2.TaskID IS NULL, NULL, h.Timestamp) as ScheduledTime,
                    p.Text as Result,
                    p.Reason as Details,
                    cih.InstanceID as SubOrchestrationId
                FROM
                    dt.Instances i
                    INNER JOIN
                    dt.History h
                    ON
                    (i.InstanceID = h.InstanceID AND i.ExecutionID = h.ExecutionID AND i.TaskHub = h.TaskHub)
                    LEFT JOIN
                    dt.History h2
                    ON
                    (
                        h.EventType IN ('TaskScheduled', 'SubOrchestrationInstanceCreated')
                        AND
                        h2.EventType IN ('SubOrchestrationInstanceCompleted', 'SubOrchestrationInstanceFailed', 'TaskCompleted', 'TaskFailed')
                        AND
                        h.InstanceID = h2.InstanceID AND h.ExecutionID = h2.ExecutionID AND h.TaskHub = h2.TaskHub AND h.TaskID = h2.TaskID AND h.SequenceNumber != h2.SequenceNumber
                    )
                    LEFT JOIN
                    dt.Payloads p
                    ON
                    p.PayloadID = h2.DataPayloadID AND p.TaskHub = h2.TaskHub AND p.InstanceID = h2.InstanceID
                    LEFT JOIN
                    (
                        select 
                            cii.ParentInstanceID,
                            cii.InstanceID,
                            cii.TaskHub,
                            chh.TaskID
                        from 
                            dt.Instances cii
                            INNER JOIN
                            dt.History chh
                            ON
                            (chh.InstanceID = cii.InstanceID AND chh.TaskHub = cii.TaskHub AND chh.EventType = 'ExecutionStarted')
                    ) cih
                    ON
                    (cih.ParentInstanceID = h.InstanceID AND cih.TaskHub = h.TaskHub AND cih.TaskID = h.TaskID AND h.EventType = 'SubOrchestrationInstanceCreated')
                    LEFT JOIN
                    dt.Instances i2
                    ON
                    (i2.InstanceID = i.InstanceID AND i2.TaskHub = @TaskHub)
                WHERE
                    h.EventType IN 
                    (
                        'ExecutionStarted', 'ExecutionCompleted', 'ExecutionFailed', 'ExecutionTerminated', 'TaskScheduled', 'SubOrchestrationInstanceCreated',
                        'ContinueAsNew', 'TimerCreated', 'TimerFired', 'EventRaised', 'EventSent'
                    )
                    AND
                    i.InstanceID = @OrchestrationInstanceId AND i.TaskHub = IIF(i2.InstanceID IS NULL, 'dbo', @TaskHub)
                ORDER BY
                    h.SequenceNumber";


            string sqlConnectionString = Environment.GetEnvironmentVariable("DFM_SQL_CONNECTION_STRING");

            using (var conn = new SqlConnection(sqlConnectionString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@OrchestrationInstanceId", instanceId);
                    cmd.Parameters.AddWithValue("@TaskHub", hubName);
                    using (SqlDataReader reader = cmd.ExecuteReader())
                    {
                        // Memorizing 'ExecutionStarted' event, to further correlate with 'ExecutionCompleted'
                        DateTimeOffset? executionStartedTimestamp = null;

                        while (reader.Read())
                        {
                            var evt = ToHistoryEvent(reader, executionStartedTimestamp);

                            if (evt.EventType == "ExecutionStarted")
                            {
                                executionStartedTimestamp = evt.Timestamp;
                            }

                            yield return evt;
                        }
                    }
                }
            }
        }

        private static HistoryEvent ToHistoryEvent(SqlDataReader reader, DateTimeOffset? executionStartTime)
        {
            var evt = new HistoryEvent
            {
                Timestamp = ((DateTime)reader["Timestamp"]).ToUniversalTime(),
                EventType = reader["EventType"].ToString(),
                EventId = reader["EventId"] is DBNull ? null : (int?)reader["EventId"],
                Name = reader["Name"].ToString(),
                Result = reader["Result"].ToString(),
                Details = reader["Details"].ToString(),
                SubOrchestrationId = reader["SubOrchestrationId"].ToString(),
            };

            var rawScheduledTime = reader["ScheduledTime"];
            if (!(rawScheduledTime is DBNull))
            {
                evt.ScheduledTime = ((DateTime)rawScheduledTime).ToUniversalTime();
            }
            else if(evt.EventType == "ExecutionCompleted")
            {
                evt.ScheduledTime = executionStartTime?.ToUniversalTime();
            }

            if (evt.ScheduledTime.HasValue)
            {
                evt.DurationInMs = (evt.Timestamp - evt.ScheduledTime.Value).TotalMilliseconds;
            }

            return evt;
        }
    }
}
