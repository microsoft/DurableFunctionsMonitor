// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Auth;
using Microsoft.WindowsAzure.Storage.Blob;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;
using Newtonsoft.Json.Serialization;

[assembly: InternalsVisibleToAttribute("durablefunctionsmonitor.dotnetbackend.tests")]

namespace DurableFunctionsMonitor.DotNetBackend
{
    static class EnvVariableNames
    {
        public const string AzureWebJobsStorage = "AzureWebJobsStorage";
        public const string AzureWebJobsFeatureFlags = "AzureWebJobsFeatureFlags";
        public const string WEBSITE_SITE_NAME = "WEBSITE_SITE_NAME";
        public const string WEBSITE_AUTH_V2_CONFIG_JSON = "WEBSITE_AUTH_V2_CONFIG_JSON";
        public const string WEBSITE_AUTH_CLIENT_ID = "WEBSITE_AUTH_CLIENT_ID";
        public const string WEBSITE_AUTH_OPENID_ISSUER = "WEBSITE_AUTH_OPENID_ISSUER";
        public const string WEBSITE_AUTH_UNAUTHENTICATED_ACTION = "WEBSITE_AUTH_UNAUTHENTICATED_ACTION";
        public const string DFM_ALLOWED_USER_NAMES = "DFM_ALLOWED_USER_NAMES";
        public const string DFM_ALLOWED_APP_ROLES = "DFM_ALLOWED_APP_ROLES";
        public const string DFM_ALLOWED_FULL_ACCESS_APP_ROLES = "DFM_ALLOWED_FULL_ACCESS_APP_ROLES";
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

        // Constant, that defines the /a/p/i/{connName}-{hubName} route prefix, to let Functions Host distinguish api methods from statics
        public const string ApiRoutePrefix = "a/p/i/{connName}-{hubName}";

        public const string IdentityBasedConnectionSettingAccountNameSuffix = "__accountName";
        public const string IdentityBasedConnectionSettingTableServiceUriSuffix = "__tableServiceUri";
        public const string IdentityBasedConnectionSettingBlobServiceUriSuffix = "__blobServiceUri";
        public const string IdentityBasedConnectionSettingCredentialSuffix = "__credential";
        public const string IdentityBasedConnectionSettingClientIdSuffix = "__clientId";
        public const string IdentityBasedConnectionSettingCredentialValue = "managedidentity";

        public const string DfMonDisableNewParentIdResolutionAlgorithm = "DfMonDisableNewParentIdResolutionAlgorithm";


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
                return DfmEndpoint.StorageConnStringEnvVarName;
            }
            else
            {
                return EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX + connName;
            }
        }

        // Applies authN/authZ rules and handles incoming HTTP request. Also does error handling.
        public static async Task<IActionResult> HandleAuthAndErrors(this HttpRequest req, OperationKind kind, string connName, string hubName, ILogger log, Func<DfmMode, Task<IActionResult>> todo)
        {
            return await HandleErrors(req, log, async () =>
            {
                var mode = await Auth.ValidateIdentityAsync(req.HttpContext.User, req.Headers, req.Cookies, CombineConnNameAndHubName(connName, hubName), kind);

                return await todo(mode);
            });
        }

        // Handles incoming HTTP request with error handling.
        public static async Task<IActionResult> HandleErrors(this HttpRequest req, ILogger log, Func<Task<IActionResult>> todo)
        {
            try
            {
                return await todo();
            }
            catch (UnauthorizedAccessException ex)
            {
                log.LogError(ex, "DFM failed to authenticate request");
                return new UnauthorizedResult();
            }
            catch (AccessViolationException ex)
            {
                log.LogError(ex, "DFM failed to authorize request");
                return new StatusCodeResult(403);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "DFM failed");
                return new BadRequestObjectResult(ex.Message);
            }
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

        // Fighting with https://github.com/Azure/azure-functions-durable-js/issues/94
        // Could use a custom JsonConverter, but it won't be invoked for nested items :(
        public static string FixUndefinedsInJson(this string json)
        {
            return json.Replace("\": undefined", "\": null");
        }

        // Shared JSON serialization settings
        public static JsonSerializerSettings SerializerSettings = GetSerializerSettings();

        // A customized way of returning JsonResult, to cope with Functions v2/v3 incompatibility
        public static ContentResult ToJsonContentResult(this object result, Func<string, string> applyThisToJson = null)
        {
            string json = JsonConvert.SerializeObject(result, Globals.SerializerSettings);
            if (applyThisToJson != null)
            {
                json = applyThisToJson(json);
            }
            return new ContentResult() { Content = json, ContentType = "application/json" };
        }

        public static IEnumerable<T> ApplyTop<T>(this IEnumerable<T> collection, IQueryCollection query)
        {
            var clause = query["$top"];
            return clause.Any() ? collection.Take(int.Parse(clause)) : collection;
        }
        public static IEnumerable<T> ApplySkip<T>(this IEnumerable<T> collection, IQueryCollection query)
        {
            var clause = query["$skip"];
            return clause.Any() ? collection.Skip(int.Parse(clause)) : collection;
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