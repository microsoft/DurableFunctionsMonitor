// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.WindowsAzure.Storage.Table;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Auth;

namespace DurableFunctionsMonitor.DotNetIsolated
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

        /// <summary>
        /// Custom value for 'User-Agent' header for requests to Azure Storage.
        /// Will only be applied to DfMon's 'native' requests (e.g. retrieving instance history or getting parentInstanceId),
        /// not to all requests DfMon makes. Still might be useful to track activity via Storage logs.
        /// </summary>
        public static string CustomUserAgent { get; set; }

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
                
                string tableServiceUri = Environment.GetEnvironmentVariable(connStringName + Globals.IdentityBasedConnectionSettingTableServiceUriSuffix);
                if (string.IsNullOrEmpty(tableServiceUri))
                {
                    string accountName = Environment.GetEnvironmentVariable(connStringName + Globals.IdentityBasedConnectionSettingAccountNameSuffix);
                    tableServiceUri = $"https://{accountName}.table.core.windows.net";
                }
                
                var identityBasedToken = await IdentityBasedTokenSource.GetTokenAsync();
                var credentials = new StorageCredentials(new TokenCredential(identityBasedToken));

                return new TableClient(new CloudTableClient(new Uri(tableServiceUri), credentials), CustomUserAgent);
            }
            else
            {
                // Using classic connection string
                return new TableClient(CloudStorageAccount.Parse(connectionString).CreateCloudTableClient(), CustomUserAgent);
            }
        }

        private TableClient(CloudTableClient client, string customUserAgent)
        {
            this._client = client;
        }

        /// <inheritdoc/>
        public async Task<IEnumerable<string>> ListTableNamesAsync()
        {
            // Overriding User-Agent header
            var operationContext = new OperationContext
            {
                CustomUserAgent = CustomUserAgent
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
                CustomUserAgent = CustomUserAgent
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
                CustomUserAgent = CustomUserAgent
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
                CustomUserAgent = CustomUserAgent
            };

            return this._client.GetTableReference(tableName).ExecuteAsync(operation, null, operationContext);
        }

        private readonly CloudTableClient _client;
    }
}