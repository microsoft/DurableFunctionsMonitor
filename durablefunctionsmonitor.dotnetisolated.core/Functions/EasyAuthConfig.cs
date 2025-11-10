// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class EasyAuthConfig : DfmFunctionBase
    {
        public EasyAuthConfig(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : base(dfmSettings, extensionPoints) 
        { 
            this._logger = loggerFactory.CreateLogger<EasyAuthConfig>();
        }

        // Returns EasyAuth configuration settings, specifically the AAD app's Client ID (which is not a secret)
        // GET /a/p/i/easyauth-config
        [Function(nameof(DfmGetEasyAuthConfigFunction))]
        public async Task<HttpResponseData> DfmGetEasyAuthConfigFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.DfMonRoutePrefix + "/a/p/i/easyauth-config")] HttpRequestData req)
        {
            // Checking nonce, if it was set as an env variable.
            // Don't care about return value of this method here.
            Auth.IsNonceSetAndValid(this.Settings, req.Headers);

            string siteName = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME);
            string clientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);

            // When deployed to Azure, this tool should always be protected by EasyAuth
            if (!string.IsNullOrEmpty(siteName) && string.IsNullOrEmpty(clientId) && !this.Settings.DisableAuthentication)
            {
                this._logger.LogError($"You need to configure EasyAuth for your '{siteName}' instance. This tool should never be exposed to the world without authentication.");

                return req.CreateResponse(HttpStatusCode.Unauthorized);
            }

            // This new setting replaces older ones, so we need to try it as well
            string authv2ConfigJsonString = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_V2_CONFIG_JSON);
            dynamic authV2ConfigJson = JObject.Parse(string.IsNullOrEmpty(authv2ConfigJsonString) ? "{}" : authv2ConfigJsonString);

            bool isServerDirectedLoginFlowEnabled = (

                Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION) == Auth.UnauthenticatedActionRedirectToLoginPage
                ||
                authV2ConfigJson?.globalValidation?.unauthenticatedClientAction == 0
            );

            if (isServerDirectedLoginFlowEnabled)
            {
                // Assuming it is the server-directed login flow to be used
                // and returning just the user name (to speed up login process)
                var claimsPrincipal = await Auth.GetClaimsPrincipal(req, this.Settings);
                var userNameClaim = claimsPrincipal?.Identities?.SingleOrDefault()?.FindAll(this.Settings.UserNameClaimName).SingleOrDefault();
                return await req.ReturnJson(new { userName = userNameClaim?.Value });
            }

            // Trying to get tenantId from WEBSITE_AUTH_OPENID_ISSUER environment variable
            string tenantId = "common";
            string openIdIssuer = Auth.GetEasyAuthIssuer();
            if (!string.IsNullOrEmpty(openIdIssuer))
            {
                var match = GuidRegex.Match(openIdIssuer);
                if (match.Success)
                {
                    tenantId = match.Groups[1].Value;
                }
            }

            return await req.ReturnJson(new { 
                clientId, 
                authority = "https://login.microsoftonline.com/" + tenantId 
            });
        }

        private static readonly Regex GuidRegex = new Regex(@"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", RegexOptions.IgnoreCase | RegexOptions.Compiled);

        private readonly ILogger _logger;
    }
}