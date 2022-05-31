// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.WindowsAzure.Storage.Table;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Auth;

namespace DurableFunctionsMonitor.DotNetBackend
{
    // CloudTableClient wrapper interface. Seems to be the only way to unit-test.
    public interface ITableClient
    {
        // Gets the list of table names
        Task<IEnumerable<string>> ListTableNamesAsync();

        // Synchronously retrieves all results from Azure Table
        IEnumerable<TEntity> GetAll<TEntity>(string tableName, TableQuery<TEntity> query) where TEntity : TableEntity, new();

        // Asynchronously retrieves all results from Azure Table
        Task<IEnumerable<TEntity>> GetAllAsync<TEntity>(string tableName, TableQuery<TEntity> query) where TEntity : TableEntity, new();
        
        // Executes a TableOperation
        Task<TableResult> ExecuteAsync(string tableName, TableOperation operation);
    }

    // CloudTableClient wrapper. Seems to be the only way to unit-test.
    class TableClient: ITableClient
    {
        // Cannot use DI functionality (our startup method will not be called when installed as a NuGet package),
        // so just leaving this as an internal static variable.
        internal static ITableClient MockedTableClient = null;

         public static async Task<ITableClient> GetTableClient(string connStringName)
        {
            if (MockedTableClient != null)
            {
                return MockedTableClient;
            }

            string connectionString = Environment.GetEnvironmentVariable(connStringName);
            if (string.IsNullOrEmpty(connectionString))
            {
                // Trying with Managed Identity/local Azure login
                string accountName = Environment.GetEnvironmentVariable(connStringName + "__accountName");
                var identityBasedToken = await IdentityBasedTokenSource.GetTokenAsync();

                var credentials = new StorageCredentials(new TokenCredential(identityBasedToken));
                var baseUri = new Uri($"https://{accountName}.table.core.windows.net");

                return new TableClient(new CloudTableClient(baseUri, credentials));
            }
            else
            {
                // Using classic connection string
                return new TableClient(CloudStorageAccount.Parse(connectionString).CreateCloudTableClient());
            }
        }

        private TableClient(CloudTableClient client)
        {
            this._client = client;
        }
        
        /// <inheritdoc/>
        public async Task<IEnumerable<string>> ListTableNamesAsync()
        {
            // Overriding User-Agent header
            var operationContext = new OperationContext
            {
                CustomUserAgent = DfmEndpoint.CustomUserAgent
            };

            var result = new List<string>();
            TableContinuationToken token = null;
            do
            {
                var nextBatch = await this._client.ListTablesSegmentedAsync(null, null, token, null, operationContext);
                result.AddRange(nextBatch.Results.Select(r => r.Name));
                token = nextBatch.ContinuationToken;
            }
            while (token != null);
            return result;
        }

        /// <inheritdoc/>
        public IEnumerable<TEntity> GetAll<TEntity>(string tableName, TableQuery<TEntity> query)
            where TEntity : TableEntity, new()
        {
            var table = this._client.GetTableReference(tableName);

            // Overriding User-Agent header
            var operationContext = new OperationContext
            {
                CustomUserAgent = DfmEndpoint.CustomUserAgent
            };

            TableContinuationToken token = null;
            do
            {
                var nextBatch = table.ExecuteQuerySegmentedAsync(query, token, null, operationContext).Result;

                foreach (var evt in nextBatch.Results)
                {
                    yield return evt;
                }

                token = nextBatch.ContinuationToken;
            }
            while (token != null);
        }

        /// <inheritdoc/>
        public async Task<IEnumerable<TEntity>> GetAllAsync<TEntity>(string tableName, TableQuery<TEntity> query)
            where TEntity : TableEntity, new()
        {
            var table = this._client.GetTableReference(tableName);

            // Overriding User-Agent header
            var operationContext = new OperationContext
            {
                CustomUserAgent = DfmEndpoint.CustomUserAgent
            };

            var result = new List<TEntity>();
            TableContinuationToken token = null;
            do
            {
                var nextBatch = await table.ExecuteQuerySegmentedAsync(query, token, null, operationContext);

                result.AddRange(nextBatch.Results);
                token = nextBatch.ContinuationToken;
            }
            while (token != null);

            return result;
        }

        /// <inheritdoc/>
        public Task<TableResult> ExecuteAsync(string tableName, TableOperation operation)
        {
            // Overriding User-Agent header
            var operationContext = new OperationContext
            {
                CustomUserAgent = DfmEndpoint.CustomUserAgent
            };

            return this._client.GetTableReference(tableName).ExecuteAsync(operation, null, operationContext);
        }

        private readonly CloudTableClient _client;
    }
}