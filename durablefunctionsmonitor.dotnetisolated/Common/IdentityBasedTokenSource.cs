// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Azure.Identity;
using Azure.Core;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    // Implements getting and caching identity-based access tokens for Storage
    class IdentityBasedTokenSource
    {
        // Cannot use DI functionality (our startup method will not be called when installed as a NuGet package),
        // so just leaving this as an internal static variable.
        internal static TokenCredential MockedTokenCredential = null;

        public static async Task<string> GetTokenAsync()
        {
            // Returning cached token, if it is not expired yet (adding a 10 seconds handicap)
            if (CachedToken.ExpiresOn > (DateTimeOffset.UtcNow + TimeSpan.FromSeconds(TokenExpirationHandicapInSeconds)))
            {
                return CachedToken.Token;
            }

            try
            {
                // Obtaining a new token
                var tokenCredential = MockedTokenCredential ?? GetTokenCredential();
                var tokenRequestContext = new TokenRequestContext(new string[] { "https://storage.azure.com" });
                CachedToken = await tokenCredential.GetTokenAsync(tokenRequestContext, CancellationToken.None);
            }
            catch (Exception)
            {
                // Resetting the cached token. Note that AccessToken is a struct
                CachedToken = new AccessToken();
                throw;
            }

            return CachedToken.Token;
        }

        internal static TokenCredential GetTokenCredential()
        {
            // Supporting user-assigned Managed Identities as well

            if (Globals.IdentityBasedConnectionSettingCredentialValue == Environment.GetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage + Globals.IdentityBasedConnectionSettingCredentialSuffix))
            {
                string clientId = Environment.GetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage + Globals.IdentityBasedConnectionSettingClientIdSuffix);
                return new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = clientId });
            }
            else
            {
                return new DefaultAzureCredential();
            }
        }

        private const int TokenExpirationHandicapInSeconds = 10;
        private static AccessToken CachedToken = new AccessToken();
    }
}