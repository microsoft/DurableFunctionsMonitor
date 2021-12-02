// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;

namespace DurableFunctionsMonitor.DotNetBackend
{
    internal static class Auth
    {
        // Magic constant for turning auth off
        public const string ISureKnowWhatIAmDoingNonce = "i_sure_know_what_i_am_doing";

        // Value of WEBSITE_AUTH_UNAUTHENTICATED_ACTION config setting, when server-directed login flow is configured
        public const string UnauthenticatedActionRedirectToLoginPage = "RedirectToLoginPage";

        // Default user name claim name
        public const string PreferredUserNameClaim = "preferred_username";

        // Roles claim name
        private const string RolesClaim = "roles";

        // If DFM_NONCE was passed as env variable, validates that the incoming request contains it. Throws UnauthorizedAccessException, if it doesn't.
        public static bool IsNonceSetAndValid(IHeaderDictionary headers)
        {
            // From now on it is the only way to skip auth
            if (DfmEndpoint.Settings.DisableAuthentication)
            {
                return true;
            }

            string nonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);

            if (!string.IsNullOrEmpty(nonce))
            {
                // Checking the nonce header
                if (nonce == headers["x-dfm-nonce"])
                {
                    return true;
                }

                throw new UnauthorizedAccessException("Invalid nonce. Call is rejected.");
            }

            return false;
        }

        // Validates that the incoming request is properly authenticated
        public static async Task ValidateIdentityAsync(ClaimsPrincipal principal, IHeaderDictionary headers, IRequestCookieCollection cookies, string taskHubName)
        {
            // First validating Task Hub name, if it was specified
            if (!string.IsNullOrEmpty(taskHubName))
            {
                await ThrowIfTaskHubNameIsInvalid(taskHubName);
            }

            // Starting with nonce (used when running as a VsCode extension)
            if (IsNonceSetAndValid(headers))
            {
                return;
            }

            // Then validating anti-forgery token
            ThrowIfXsrfTokenIsInvalid(headers, cookies);

            // Trying with EasyAuth
            var userNameClaim = principal?.FindFirst(DfmEndpoint.Settings.UserNameClaimName);
            if (userNameClaim == null)
            {
                // Validating and parsing the token ourselves
                principal = await ValidateToken(headers["Authorization"]);
                userNameClaim = principal.FindFirst(DfmEndpoint.Settings.UserNameClaimName);
            }

            if (userNameClaim == null)
            {
                throw new UnauthorizedAccessException($"'{DfmEndpoint.Settings.UserNameClaimName}' claim is missing in the incoming identity. Call is rejected.");
            }

            if (DfmEndpoint.Settings.AllowedUserNames != null)
            {
                if (!DfmEndpoint.Settings.AllowedUserNames.Contains(userNameClaim.Value))
                {
                    throw new UnauthorizedAccessException($"User {userNameClaim.Value} is not mentioned in {EnvVariableNames.DFM_ALLOWED_USER_NAMES} config setting. Call is rejected");
                }
            }

            // Also validating App Roles, if set
            if (DfmEndpoint.Settings.AllowedAppRoles != null)
            {
                var roleClaims = principal.FindAll(RolesClaim);
                if (!roleClaims.Any(claim => DfmEndpoint.Settings.AllowedAppRoles.Contains(claim.Value)))
                {
                    throw new UnauthorizedAccessException($"User {userNameClaim.Value} doesn't have any of roles mentioned in {EnvVariableNames.DFM_ALLOWED_APP_ROLES} config setting. Call is rejected");
                }
            }
        }

        private static async Task<HashSet<string>> GetTaskHubNamesFromStorage(string connStringName)
        {
            var tableNames = await TableClient.GetTableClient(connStringName).ListTableNamesAsync();

            var hubNames = new HashSet<string>(tableNames
                .Where(n => n.EndsWith("Instances"))
                .Select(n => n.Remove(n.Length - "Instances".Length)),
                StringComparer.InvariantCultureIgnoreCase);

            hubNames.IntersectWith(tableNames
                .Where(n => n.EndsWith("History"))
                .Select(n => n.Remove(n.Length - "History".Length)));

            return hubNames;
        }

        // Lists all allowed Task Hubs. The returned HashSet is configured to ignore case.
        public static async Task<HashSet<string>> GetAllowedTaskHubNamesAsync()
        {
            // Respecting DFM_HUB_NAME, if it is set
            string dfmHubName = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME);
            if (!string.IsNullOrEmpty(dfmHubName))
            {
                return new HashSet<string>(dfmHubName.Split(','), StringComparer.InvariantCultureIgnoreCase);
            }

            // Also respecting host.json setting, when set
            dfmHubName = TryGetHubNameFromHostJson();
            if (!string.IsNullOrEmpty(dfmHubName))
            {
                return new HashSet<string>(new string[] { dfmHubName }, StringComparer.InvariantCultureIgnoreCase);
            }

            // Otherwise trying to load table names from the Storage
            try
            {
                var hubNames = await GetTaskHubNamesFromStorage(EnvVariableNames.AzureWebJobsStorage);

                // Also checking alternative connection strings
                foreach(var connName in AlternativeConnectionStringNames)
                {
                    var connAndHubNames = (await GetTaskHubNamesFromStorage(Globals.GetFullConnectionStringEnvVariableName(connName)))
                        .Select(hubName => Globals.CombineConnNameAndHubName(connName, hubName));

                    hubNames.UnionWith(connAndHubNames);
                }

                return hubNames;
            }
            catch (Exception)
            {
                // Intentionally returning null. Need to skip validation, if for some reason list of tables
                // cannot be loaded from Storage. But only in that case.
                return null;
            }
        }

        private static readonly Regex ValidTaskHubNameRegex = new Regex(@"^[\w-]{3,128}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static Task<HashSet<string>> HubNamesTask = GetAllowedTaskHubNamesAsync();

        // Checks that a Task Hub name looks like a Task Hub name
        public static void ThrowIfTaskHubNameHasInvalidSymbols(string hubName)
        {
            if (!ValidTaskHubNameRegex.Match(hubName).Success)
            {
                throw new ArgumentException($"Task Hub name is invalid.");
            }
        }

        // Checks that a Task Hub name is valid for this instace
        public static async Task ThrowIfTaskHubNameIsInvalid(string hubName)
        {
            // Two bugs away. Validating that the incoming Task Hub name looks like a Task Hub name
            ThrowIfTaskHubNameHasInvalidSymbols(hubName);

            var hubNames = await HubNamesTask;

            if (hubNames == null || !hubNames.Contains(hubName))
            {
                // doing double-check, by reloading hub names
                HubNamesTask = GetAllowedTaskHubNamesAsync();
                hubNames = await HubNamesTask;
            }

            // If existing Task Hub names cannot be read from Storage, we can only skip validation and return true.
            // Note, that it will never be null, if DFM_HUB_NAME is set. So authZ is always in place.
            if (hubNames == null)
            {
                return;
            }

            if (!hubNames.Contains(hubName))
            {
                throw new UnauthorizedAccessException($"Task Hub '{hubName}' is not allowed.");
            }
        }

        // Compares our XSRF tokens, that come from cookies and headers
        public static void ThrowIfXsrfTokenIsInvalid(IHeaderDictionary headers, IRequestCookieCollection cookies)
        {
            string tokenFromHeaders = headers[Globals.XsrfTokenCookieAndHeaderName];

            if (string.IsNullOrEmpty(tokenFromHeaders))
            {
                throw new UnauthorizedAccessException("XSRF token is missing.");
            }

            string tokenFromCookies = cookies[Globals.XsrfTokenCookieAndHeaderName];

            if (tokenFromCookies != tokenFromHeaders)
            {
                throw new UnauthorizedAccessException("XSRF tokens do not match.");
            }
        }

        internal static string[] AlternativeConnectionStringNames = GetAlternativeConnectionStringNames().ToArray();

        internal static IEnumerable<string> GetAlternativeConnectionStringNames()
        {
            var envVars = Environment.GetEnvironmentVariables();
            foreach(DictionaryEntry kv in envVars)
            {
                string variableName = kv.Key.ToString();
                if (variableName.StartsWith(EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX))
                {
                    yield return variableName.Substring(EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX.Length);
                }
            }
        } 

        private static string TryGetHubNameFromHostJson()
        {
            try
            {
                string assemblyLocation = Assembly.GetExecutingAssembly().Location;
                string functionAppFolder = Path.GetDirectoryName(Path.GetDirectoryName(assemblyLocation));

                string hostJsonFileName = Path.Combine(functionAppFolder, "host.json");
                dynamic hostJson = JObject.Parse(File.ReadAllText(hostJsonFileName));

                string hubName = hostJson.extensions.durableTask.hubName;
                if (hubName.StartsWith('%') && hubName.EndsWith('%'))
                {
                    hubName = Environment.GetEnvironmentVariable(hubName.Trim('%'));
                }

                return hubName;
            }
            catch (Exception)
            {
                return string.Empty;
            }
        }

        internal static JwtSecurityTokenHandler MockedJwtSecurityTokenHandler = null;

        private static async Task<ClaimsPrincipal> ValidateToken(string authorizationHeader)
        {
            if (string.IsNullOrEmpty(authorizationHeader))
            {
                throw new UnauthorizedAccessException("No access token provided. Call is rejected.");
            }

            string clientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);
            if (string.IsNullOrEmpty(clientId))
            {
                throw new UnauthorizedAccessException($"Specify the Valid Audience value via '{EnvVariableNames.WEBSITE_AUTH_CLIENT_ID}' config setting. Typically it is the ClientId of your AAD application.");
            }

            string openIdIssuer = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER);
            if (string.IsNullOrEmpty(openIdIssuer))
            {
                throw new UnauthorizedAccessException($"Specify the Valid Issuer value via '{EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER}' config setting. Typically it looks like 'https://login.microsoftonline.com/<your-aad-tenant-id>/v2.0'.");
            }

            string token = authorizationHeader.Substring("Bearer ".Length);

            var validationParameters = new TokenValidationParameters
            {
                ValidAudiences = new[] { clientId },
                ValidIssuers = new[] { openIdIssuer },
                // Yes, it is OK to await a Task multiple times like this
                IssuerSigningKeys = await GetSigningKeysTask,
                // According to internet, this should not be needed (despite the fact that the default value is false)
                // But better to be two-bugs away
                ValidateIssuerSigningKey = true
            };

            var handler = MockedJwtSecurityTokenHandler ?? new JwtSecurityTokenHandler();

            return handler.ValidateToken(token, validationParameters, out SecurityToken validatedToken);
        }

        // Caching the keys for 24 hours
        internal static Task<ICollection<SecurityKey>> GetSigningKeysTask = InitGetSigningKeysTask(86400, 0);

        internal static Task<ICollection<SecurityKey>> InitGetSigningKeysTask(int cacheTtlInSeconds, int retryCount = 0)
        {
            // If you ever use this code in Asp.Net, don't forget to wrap this line with Task.Run(), to decouple from SynchronizationContext
            var task = GetSigningKeysAsync();

            // Adding cache-flushing continuation
            task.ContinueWith(async t =>
            {
                // If the data retrieval failed, then retrying immediately, but no more than 3 times.
                // Otherwise re-populating the cache in cacheTtlInSeconds.
                if (t.IsFaulted)
                {
                    if (retryCount > 1)
                    {
                        return;
                    }
                }
                else
                {
                    await Task.Delay(TimeSpan.FromSeconds(cacheTtlInSeconds));
                }

                GetSigningKeysTask = InitGetSigningKeysTask(cacheTtlInSeconds, t.IsFaulted ? retryCount + 1 : 0);
            });

            return task;
        }

        private static async Task<ICollection<SecurityKey>> GetSigningKeysAsync()
        {
            string openIdIssuer = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER);
            if (string.IsNullOrEmpty(openIdIssuer))
            {
                throw new UnauthorizedAccessException($"Specify the Valid Issuer value via '{EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER}' config setting. Typically it looks like 'https://login.microsoftonline.com/<your-aad-tenant-id>/v2.0'.");
            }

            if (openIdIssuer.EndsWith("/v2.0"))
            {
                openIdIssuer = openIdIssuer.Substring(0, openIdIssuer.Length - "/v2.0".Length);
            }

            string stsDiscoveryEndpoint = $"{openIdIssuer}/.well-known/openid-configuration";
            var configManager = new ConfigurationManager<OpenIdConnectConfiguration>(stsDiscoveryEndpoint, new OpenIdConnectConfigurationRetriever());
            var config = await configManager.GetConfigurationAsync();

            return config.SigningKeys;
        }
    }
}