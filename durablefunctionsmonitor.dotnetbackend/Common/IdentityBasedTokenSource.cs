// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Threading.Tasks;
using Azure.Identity;
using Azure.Core;
using System.Threading;

namespace DurableFunctionsMonitor.DotNetBackend
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
                var tokenCredential = MockedTokenCredential ?? new DefaultAzureCredential();
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

        private const int TokenExpirationHandicapInSeconds = 10;
        private static AccessToken CachedToken = new AccessToken();
    }
}