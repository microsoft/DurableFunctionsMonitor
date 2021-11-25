using System;
using System.Collections.Generic;
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
            DfmEndpoint.Setup(null, new DfmExtensionPoints { GetInstanceHistoryRoutine = GetInstanceHistory });
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
					(i.InstanceID = h.InstanceID AND i.ExecutionID = h.ExecutionID)
					LEFT JOIN
					dt.History h2
					ON
					(
						h.EventType IN ('TaskScheduled', 'SubOrchestrationInstanceCreated')
						AND
						h2.EventType IN ('SubOrchestrationInstanceCompleted', 'SubOrchestrationInstanceFailed', 'TaskCompleted', 'TaskFailed')
						AND
						h.InstanceID = h2.InstanceID AND h.ExecutionID = h2.ExecutionID AND h.TaskID = h2.TaskID AND h.SequenceNumber != h2.SequenceNumber
					)
					LEFT JOIN
					dt.Payloads p
					ON
					p.PayloadID = h2.DataPayloadID
					LEFT JOIN
					(
						select 
							cii.ParentInstanceID,
							cii.InstanceID,
							chh.TaskID
						from 
							dt.Instances cii
							INNER JOIN
							dt.History chh
							ON
							(chh.InstanceID = cii.InstanceID AND chh.EventType = 'ExecutionStarted')
					) cih
					ON
					(cih.ParentInstanceID = h.InstanceID AND cih.TaskID = h.TaskID)
				WHERE
					h.EventType IN 
					(
						'ExecutionStarted', 'ExecutionCompleted', 'ExecutionFailed', 'ExecutionTerminated', 'TaskScheduled', 'SubOrchestrationInstanceCreated',
						'ContinueAsNew', 'TimerCreated', 'TimerFired', 'EventRaised', 'EventSent'
					)
					AND
					i.InstanceID = @OrchestrationInstanceId

				ORDER BY
					h.SequenceNumber";


            string sqlConnectionString = Environment.GetEnvironmentVariable("DFM_SQL_CONNECTION_STRING");

            using (var conn = new SqlConnection(sqlConnectionString))
            {
                conn.Open();

                using (var cmd = new SqlCommand(sql, conn))
                {
                    cmd.Parameters.AddWithValue("@OrchestrationInstanceId", instanceId);

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
