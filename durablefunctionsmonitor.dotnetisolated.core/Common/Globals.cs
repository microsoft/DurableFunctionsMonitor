// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Collections.Specialized;
using System.Net;
using System.Reflection;
using System.Runtime.CompilerServices;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Auth;
using Microsoft.WindowsAzure.Storage.Blob;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

[assembly: InternalsVisibleToAttribute("durablefunctionsmonitor.dotnetisolated.tests")]

namespace DurableFunctionsMonitor.DotNetIsolated
{
    static class EnvVariableNames
    {
        public const string AzureWebJobsStorage = "AzureWebJobsStorage";
        public const string WEBSITE_SITE_NAME = "WEBSITE_SITE_NAME";
        public const string WEBSITE_AUTH_V2_CONFIG_JSON = "WEBSITE_AUTH_V2_CONFIG_JSON";
        public const string WEBSITE_AUTH_CLIENT_ID = "WEBSITE_AUTH_CLIENT_ID";
        public const string WEBSITE_AUTH_OPENID_ISSUER = "WEBSITE_AUTH_OPENID_ISSUER";
        public const string WEBSITE_AUTH_UNAUTHENTICATED_ACTION = "WEBSITE_AUTH_UNAUTHENTICATED_ACTION";
        public const string DFM_ALLOWED_USER_NAMES = "DFM_ALLOWED_USER_NAMES";
        public const string DFM_ALLOWED_APP_ROLES = "DFM_ALLOWED_APP_ROLES";
        public const string DFM_ALLOWED_READ_ONLY_APP_ROLES = "DFM_ALLOWED_READ_ONLY_APP_ROLES";
        public const string DFM_HUB_NAME = "DFM_HUB_NAME";
        public const string DFM_NONCE = "DFM_NONCE";
        public const string DFM_CLIENT_CONFIG = "DFM_CLIENT_CONFIG";
        public const string DFM_MODE = "DFM_MODE";
        public const string DFM_USERNAME_CLAIM_NAME = "DFM_USERNAME_CLAIM_NAME";
        public const string DFM_ROLES_CLAIM_NAME = "DFM_ROLES_CLAIM_NAME";
        public const string DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX = "DFM_ALTERNATIVE_CONNECTION_STRING_";
        public const string DFM_INGRESS_ROUTE_PREFIX = "DFM_INGRESS_ROUTE_PREFIX";
    }

    static class Globals
    {
        public const string XsrfTokenCookieAndHeaderName = "x-dfm-xsrf-token";
        public const string TemplateContainerName = "durable-functions-monitor";
        public const string TabTemplateFolderName = "tab-templates";
        public const string FunctionMapFolderName = "function-maps";
        public const string FunctionMapFilePrefix = "dfm-func-map";
        public const string CustomMetaTagBlobName = "custom-meta-tag.htm";

        public const string ConnAndTaskHubNameSeparator = "-";

        public const string HubNameRouteParamName = "{hubName}";

        public const string DfMonRoutePrefix = "durable-functions-monitor";

        // Constant, that defines the /a/p/i/{connName}-{hubName} route prefix, to let Functions Host distinguish api methods from statics
        public const string ApiRoutePrefix = DfMonRoutePrefix + "/a/p/i/{connName}-{hubName}";

        public const string IdentityBasedConnectionSettingAccountNameSuffix = "__accountName";
        public const string IdentityBasedConnectionSettingTableServiceUriSuffix = "__tableServiceUri";
        public const string IdentityBasedConnectionSettingBlobServiceUriSuffix = "__blobServiceUri";
        public const string IdentityBasedConnectionSettingCredentialSuffix = "__credential";
        public const string IdentityBasedConnectionSettingClientIdSuffix = "__clientId";
        public const string IdentityBasedConnectionSettingCredentialValue = "managedidentity";

        public const string DfmModeContextValue = "DfmModeContextValue";

        public static void SplitConnNameAndHubName(string connAndHubName, out string connName, out string hubName)
        {
            int pos = connAndHubName.LastIndexOf("-");
            if (pos < 0)
            {
                connName = null;
                hubName = connAndHubName;
            }
            else
            {
                connName = connAndHubName.Substring(0, pos);
                hubName = connAndHubName.Substring(pos + 1);
            }
        }

        public static string CombineConnNameAndHubName(string connName, string hubName)
        {
            if (string.IsNullOrEmpty(connName) || connName == "-")
            {
                return hubName;
            }

            return $"{connName}{ConnAndTaskHubNameSeparator}{hubName}";
        }

        public static bool IsDefaultConnectionStringName(string connName)
        {
            return string.IsNullOrEmpty(connName) || connName == "-";
        }

        public static string GetFullConnectionStringEnvVariableName(string connName)
        {
            if (IsDefaultConnectionStringName(connName))
            {
                return EnvVariableNames.AzureWebJobsStorage;
            }
            else
            {
                return EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX + connName;
            }
        }


        // Fighting with https://github.com/Azure/azure-functions-durable-js/issues/94
        // Could use a custom JsonConverter, but it won't be invoked for nested items :(
        public static string FixUndefinedsInJson(this string json)
        {
            return json.Replace("\": undefined", "\": null");
        }

        // A custom way of returning JSON
        public static async Task<HttpResponseData> ReturnJson(this HttpRequestData req, object result, Func<string, string> applyThisToJson = null)
        {
            string json = JsonConvert.SerializeObject(result, Globals.SerializerSettings);
            if (applyThisToJson != null)
            {
                json = applyThisToJson(json);
            }

            var response = req.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", "application/json");
            await response.WriteStringAsync(json);

            return response;
        }

        // Routine to return an HTTP status and a string body
        public static HttpResponseData ReturnStatus(this HttpRequestData req, HttpStatusCode status, string body = null)
        {
            var result = req.CreateResponse(status);
            if (!string.IsNullOrEmpty(body))
            {
                result.WriteString(body);
            }
            return result;
        }

        // Lists all blobs from Azure Blob Container
        public static async Task<IEnumerable<IListBlobItem>> ListBlobsAsync(this CloudBlobContainer container, string prefix)
        {
            var result = new List<IListBlobItem>();
            BlobContinuationToken token = null;
            do
            {
                var nextBatch = await container.ListBlobsSegmentedAsync(prefix, token);
                result.AddRange(nextBatch.Results);
                token = nextBatch.ContinuationToken;
            }
            while (token != null);
            return result;
        }

        public static IEnumerable<T> ApplyTop<T>(this IEnumerable<T> collection, NameValueCollection query)
        {
            var clause = query["$top"];
            return !string.IsNullOrEmpty(clause) ? collection.Take(int.Parse(clause)) : collection;
        }
        
        public static IEnumerable<T> ApplySkip<T>(this IEnumerable<T> collection, NameValueCollection query)
        {
            var clause = query["$skip"];
            return !string.IsNullOrEmpty(clause) ? collection.Skip(int.Parse(clause)) : collection;
        }

        public static string GetVersion()
        {
            var version = typeof(ExtensionMethods).Assembly.GetName().Version;
            return $"{version.Major}.{version.Minor}.{version.Build}";
        }

        public static async Task<CloudBlobClient> GetCloudBlobClient(string connStringName)
        {
            string connectionString = Environment.GetEnvironmentVariable(connStringName);
            if (string.IsNullOrEmpty(connectionString))
            {
                // Trying with Managed Identity/local Azure login

                string blobServiceUri = Environment.GetEnvironmentVariable(connStringName + Globals.IdentityBasedConnectionSettingBlobServiceUriSuffix);
                if (string.IsNullOrEmpty(blobServiceUri))
                {
                    string accountName = Environment.GetEnvironmentVariable(connStringName + Globals.IdentityBasedConnectionSettingAccountNameSuffix);
                    blobServiceUri = $"https://{accountName}.blob.core.windows.net";
                }

                var identityBasedToken = await IdentityBasedTokenSource.GetTokenAsync();
                var credentials = new StorageCredentials(new TokenCredential(identityBasedToken));

                return new CloudBlobClient(new Uri(blobServiceUri), credentials);
            }
            else
            {
                // Using classic connection string
                return CloudStorageAccount.Parse(connectionString).CreateCloudBlobClient();
            }
        }

        public static string GetHostJsonPath()
        {
            string assemblyLocation = Assembly.GetExecutingAssembly().Location;

            // First trying current folder
            string result = Path.Combine(Path.GetDirectoryName(assemblyLocation), "host.json");

            if (File.Exists(result))
            {
                return result;
            }

            // Falling back to parent folder
            result = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(assemblyLocation)), "host.json");

            return result;
        }

        // Shared JSON serialization settings
        public static JsonSerializerSettings SerializerSettings = GetSerializerSettings();

        private static JsonSerializerSettings GetSerializerSettings()
        {
            var settings = new JsonSerializerSettings
            {
                Formatting = Formatting.Indented,
                DateFormatString = "yyyy-MM-ddTHH:mm:ssZ",
                ContractResolver = new CamelCasePropertyNamesContractResolver()
            };
            settings.Converters.Add(new StringEnumConverter());
            return settings;
        }
    }
}