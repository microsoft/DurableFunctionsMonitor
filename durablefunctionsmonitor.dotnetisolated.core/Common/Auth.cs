// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Collections;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Newtonsoft.Json.Linq;
using HttpRequestData = Microsoft.Azure.Functions.Worker.Http.HttpRequestData;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Defines whether a Function only reads data or makes modifications.
    /// Used for applying authorization rules.
    /// </summary>
    public enum OperationKind
    {
        Read,
        Write
    }

    internal static class Auth
    {
        // Magic constant for turning auth off
        public const string ISureKnowWhatIAmDoingNonce = "i_sure_know_what_i_am_doing";

        // Value of WEBSITE_AUTH_UNAUTHENTICATED_ACTION config setting, when server-directed login flow is configured
        public const string UnauthenticatedActionRedirectToLoginPage = "RedirectToLoginPage";

        // Default user name claim name
        public const string PreferredUserNameClaim = "preferred_username";

        // Roles claim name
        public const string RolesClaim = "roles";

        // Tries to get Easy Auth Issuer setting from env variables
        public static string GetEasyAuthIssuer()
        {
            string result = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER);
            if (!string.IsNullOrEmpty(result))
            {
                return result;
            }

            // Now trying Auth V2 settings
            string authv2ConfigJsonString = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_V2_CONFIG_JSON);
            dynamic authV2ConfigJson = JObject.Parse(string.IsNullOrEmpty(authv2ConfigJsonString) ? "{}" : authv2ConfigJsonString);

            result = authV2ConfigJson?.identityProviders?.azureActiveDirectory?.registration?.openIdIssuer;

            return result ?? string.Empty;
        }

        // If DFM_NONCE was passed as env variable, validates that the incoming request contains it. Throws UnauthorizedAccessException, if it doesn't.
        public static bool IsNonceSetAndValid(DfmSettings settings, HttpHeadersCollection headers)
        {
            // From now on it is the only way to skip auth
            if (settings.DisableAuthentication)
            {
                return true;
            }

            string nonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);

            if (!string.IsNullOrEmpty(nonce))
            {
                headers.TryGetValues("x-dfm-nonce", out var headerValues);

                // Checking the nonce header
                if (nonce == headerValues?.First())
                {
                    return true;
                }

                throw new DfmUnauthorizedException("Invalid nonce. Call is rejected.");
            }

            return false;
        }

        /// <summary>
        /// Validates that the incoming request is properly authenticated. Throws if not.
        /// </summary>
        /// <returns><see cref="DfmMode"/> value for current request (so that it can be returned to the calling code) </returns>
        /// <exception cref="DfmAccessViolationException"></exception>
        /// <exception cref="DfmUnauthorizedException"></exception>
        public static async Task<DfmMode> ValidateIdentityAsync(HttpRequestData request, OperationKind operationKind, DfmSettings settings, DfmExtensionPoints extensionPoints)
        {
            // Checking if the endpoint is in ReadOnly mode
            if (operationKind != OperationKind.Read && settings.Mode == DfmMode.ReadOnly)
            {
                throw new DfmAccessViolationException("Endpoint is in ReadOnly mode");
            }

            // Validating Task Hub name, if it can be found in the URL
            var connNameAndHubNameMatch = ConnNameAndHubNameRegex.Match(request.Url.AbsolutePath);
            if (connNameAndHubNameMatch.Success)
            {
                string connName = connNameAndHubNameMatch.Groups[1].Value;
                string hubName = connNameAndHubNameMatch.Groups[2].Value;

                await ThrowIfTaskHubNameIsInvalid(Globals.CombineConnNameAndHubName(connName, hubName), extensionPoints);
            }

            // Starting with nonce (used when running as a VsCode extension)
            if (IsNonceSetAndValid(settings, request.Headers))
            {
                return settings.Mode;
            }

            // Then validating anti-forgery token
            ThrowIfXsrfTokenIsInvalid(request.Headers, request.Cookies);

            var principal = await GetClaimsPrincipal(request, settings);
            var userNameClaim = principal.FindAll(settings.UserNameClaimName).SingleOrDefault();

            if (userNameClaim == null)
            {
                throw new DfmUnauthorizedException($"'{settings.UserNameClaimName}' claim is missing in the incoming identity. Call is rejected.");
            }

            if (settings.AllowedUserNames != null)
            {
                if (!settings.AllowedUserNames.Contains(userNameClaim.Value))
                {
                    throw new DfmUnauthorizedException($"User {userNameClaim.Value} is not mentioned in {EnvVariableNames.DFM_ALLOWED_USER_NAMES} config setting. Call is rejected");
                }
            }

            // Also validating App Roles, but only if any of relevant setting is set
            var allowedAppRoles = settings.AllowedAppRoles;
            var allowedReadOnlyAppRoles = settings.AllowedReadOnlyAppRoles;

            if (allowedAppRoles != null || allowedReadOnlyAppRoles != null)
            {
                var roleClaims = principal.FindAll(settings.RolesClaimName);

                bool userIsInAppRole = roleClaims.Any(claim => allowedAppRoles != null && allowedAppRoles.Contains(claim.Value));
                bool userIsInReadonlyRole = roleClaims.Any(claim => allowedReadOnlyAppRoles != null && allowedReadOnlyAppRoles.Contains(claim.Value));

                // If user belongs _neither_ to AllowedAppRoles _nor_ to AllowedReadOnlyAppRoles
                if (!(userIsInAppRole || userIsInReadonlyRole))
                {
                    throw new DfmUnauthorizedException($"User {userNameClaim.Value} doesn't have any of roles mentioned in {EnvVariableNames.DFM_ALLOWED_APP_ROLES} or {EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES} config setting. Call is rejected");
                }

                // If current operation modifies any data, then validating that user is _not_ in ReadOnly mode
                if (operationKind != OperationKind.Read && userIsInReadonlyRole)
                {
                    throw new DfmAccessViolationException($"User {userNameClaim.Value} is in read-only mode");
                }

                return userIsInReadonlyRole ? DfmMode.ReadOnly : settings.Mode;
            }

            return settings.Mode;
        }

        public static async Task<IEnumerable<string>> GetTaskHubNamesFromStorage(string connStringName)
        {
            var tableClient = await TableClient.GetTableClient(connStringName);
            var tableNames = await tableClient.ListTableNamesAsync();

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
        public static async Task<HashSet<string>> GetAllowedTaskHubNamesAsync(DfmExtensionPoints extensionPoints)
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
                var hubNames = new HashSet<string>(
                    await extensionPoints.GetTaskHubNamesRoutine(Globals.StorageConnStringEnvVarName),
                    StringComparer.InvariantCultureIgnoreCase
                );

                // Also checking alternative connection strings
                foreach (var connName in AlternativeConnectionStringNames)
                {
                    var connAndHubNames = (await extensionPoints.GetTaskHubNamesRoutine(Globals.GetFullConnectionStringEnvVariableName(connName)))
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

        private static readonly Regex ConnNameAndHubNameRegex = new Regex(@"/a/p/i/([^/]+)-([^/]+)/", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private static Task<HashSet<string>> HubNamesTask = null;

        // Checks that a Task Hub name looks like a Task Hub name
        public static void ThrowIfTaskHubNameHasInvalidSymbols(string hubName)
        {
            if (!ValidTaskHubNameRegex.Match(hubName).Success)
            {
                throw new DfmUnauthorizedException($"Task Hub name is invalid.");
            }
        }

        // Checks that a Task Hub name is valid for this instace
        public static async Task ThrowIfTaskHubNameIsInvalid(string hubName, DfmExtensionPoints extensionPoints)
        {
            // Two bugs away. Validating that the incoming Task Hub name looks like a Task Hub name
            ThrowIfTaskHubNameHasInvalidSymbols(hubName);

            var hubNames = HubNamesTask == null ? null : (await HubNamesTask);

            if (hubNames == null || !hubNames.Contains(hubName))
            {
                // doing double-check, by reloading hub names
                HubNamesTask = GetAllowedTaskHubNamesAsync(extensionPoints);
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
                throw new DfmUnauthorizedException($"Task Hub '{hubName}' is not allowed.");
            }
        }

        // Compares our XSRF tokens, that come from cookies and headers
        public static void ThrowIfXsrfTokenIsInvalid(HttpHeadersCollection headers, IReadOnlyCollection<IHttpCookie> cookies)
        {
            headers.TryGetValues(Globals.XsrfTokenCookieAndHeaderName, out var xsrfTokenHeaderValues);
            string tokenFromHeaders = xsrfTokenHeaderValues?.SingleOrDefault();

            var tokenFromCookies = cookies.SingleOrDefault(c => c.Name == Globals.XsrfTokenCookieAndHeaderName)?.Value;

            if (string.IsNullOrEmpty(tokenFromHeaders) || string.IsNullOrEmpty(tokenFromCookies))
            {
                throw new DfmUnauthorizedException("XSRF token is missing.");
            }

            // For some reason, in Isolated mode cookies come URL-encoded
            tokenFromCookies = Uri.UnescapeDataString(tokenFromCookies);

            if (tokenFromCookies != tokenFromHeaders)
            {
                throw new DfmUnauthorizedException("XSRF tokens do not match.");
            }
        }

        public static string[] AlternativeConnectionStringNames = GetAlternativeConnectionStringNames().ToArray();

        public static IEnumerable<string> GetAlternativeConnectionStringNames()
        {
            var envVars = Environment.GetEnvironmentVariables();
            foreach (DictionaryEntry kv in envVars)
            {
                string variableName = kv.Key.ToString();
                if (variableName.StartsWith(EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX))
                {
                    yield return variableName[EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX.Length..];
                }
            }
        }

        private static string TryGetHubNameFromHostJson()
        {
            try
            {
                string hostJsonFileName = Globals.GetHostJsonPath();
                dynamic hostJson = JObject.Parse(File.ReadAllText(hostJsonFileName));

                string hubName = hostJson.extensions.durableTask.hubName;
                if (hubName != null && hubName.StartsWith('%') && hubName.EndsWith('%'))
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

        private static async Task<ClaimsPrincipal> GetClaimsPrincipal(HttpRequestData request, DfmSettings settings)
        {
            // First trying the request object
            var easyAuthPrincipal = new ClaimsPrincipal(request.Identities);

            if (easyAuthPrincipal.Identity != null && easyAuthPrincipal.Identity.IsAuthenticated && easyAuthPrincipal.HasClaim(c => c.Type == settings.UserNameClaimName))
            {
                // Authentication was done by EasyAuth and converted into a ClaimsPrincipal by the Functions runtime. Returning immediately.
                return easyAuthPrincipal;
            }

            // Then trying to parse the x-ms-client-principal header
            if (request.Headers.TryGetValues("x-ms-client-principal", out var clientPrincipalHeaderValues))
            {
                return ParseMsClientPrincipalHeader(clientPrincipalHeaderValues.Single(), settings);
            }

            // Validating and parsing the access token ourselves
            request.Headers.TryGetValues("Authorization", out var authHeaderValues);
            return await ValidateToken(authHeaderValues?.SingleOrDefault());
        }

        // parsing header directly as per the guidance here: https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-http-webhook-trigger?tabs=python-v2%2Cisolated-process%2Cnodejs-v4%2Cfunctionsv2&pivots=programming-language-csharp#working-with-client-identities
        private  static ClaimsPrincipal ParseMsClientPrincipalHeader(string headerValue, DfmSettings settings)
        {
            // First need to make sure Easy Auth is in effect. Otherwise we must never trust the x-ms-client-principal header.
            string siteName = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME);
            string clientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);

            if (string.IsNullOrWhiteSpace(siteName) || string.IsNullOrWhiteSpace(clientId))
            {
                throw new DfmUnauthorizedException($"The incoming 'x-ms-client-principal' header is not legitimate. Call is rejected.");
            }

            // Now parsing the header value
            try
            {
                string clientPrincipalJson = Encoding.UTF8.GetString(Convert.FromBase64String(headerValue));

                dynamic clientPrincipal = JObject.Parse(clientPrincipalJson);

                var identity = new ClaimsIdentity((string)clientPrincipal.auth_typ);
                var claims = (IEnumerable<dynamic>)clientPrincipal.claims;

                var userNameClaim = claims.SingleOrDefault(c => c.typ == settings.UserNameClaimName);
                if (userNameClaim != null)
                {
                    string userNameClaimValue = userNameClaim.val;

                    identity.AddClaim(new Claim(settings.UserNameClaimName, userNameClaimValue));
                }

                var roles = claims.Where(c => c.typ == settings.RolesClaimName).Select(c => (string)c.val);
                identity.AddClaims(roles.Select(r => new Claim(settings.RolesClaimName, r)));

                return new ClaimsPrincipal(identity);
            }
            catch(Exception ex)
            {
                throw new DfmUnauthorizedException($"Failed to parse the 'x-ms-client-principal' header. {ex.Message}. Call is rejected.");
            }
        }

        internal static JwtSecurityTokenHandler MockedJwtSecurityTokenHandler = null;

        private static async Task<ClaimsPrincipal> ValidateToken(string authorizationHeader)
        {
            if (string.IsNullOrEmpty(authorizationHeader))
            {
                throw new DfmUnauthorizedException("No access token provided. Call is rejected.");
            }

            string clientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);
            if (string.IsNullOrEmpty(clientId))
            {
                throw new DfmUnauthorizedException($"Specify the Valid Audience value via '{EnvVariableNames.WEBSITE_AUTH_CLIENT_ID}' config setting. Typically it is the ClientId of your AAD application.");
            }

            string openIdIssuer = GetEasyAuthIssuer();
            if (string.IsNullOrEmpty(openIdIssuer))
            {
                throw new DfmUnauthorizedException($"Specify the Valid Issuer value via '{EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER}' config setting. Typically it looks like 'https://login.microsoftonline.com/<your-aad-tenant-id>/v2.0'.");
            }

            string token = authorizationHeader["Bearer ".Length..];

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
            return handler.ValidateToken(token, validationParameters, out _);
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
            string openIdIssuer = GetEasyAuthIssuer();
            if (string.IsNullOrEmpty(openIdIssuer))
            {
                throw new DfmUnauthorizedException($"Specify the Valid Issuer value via '{EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER}' config setting. Typically it looks like 'https://login.microsoftonline.com/<your-aad-tenant-id>/v2.0'.");
            }

            if (openIdIssuer.EndsWith("/v2.0"))
            {
                openIdIssuer = openIdIssuer[..^"/v2.0".Length];
            }

            string stsDiscoveryEndpoint = $"{openIdIssuer}/.well-known/openid-configuration";
            var configManager = new ConfigurationManager<OpenIdConnectConfiguration>(stsDiscoveryEndpoint, new OpenIdConnectConfigurationRetriever());
            var config = await configManager.GetConfigurationAsync();

            return config.SigningKeys;
        }
    }
}