// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using DurableFunctionsMonitor.DotNetBackend;
using System.Threading.Tasks;
using System;
using System.Threading;
using Azure.Core;

namespace durablefunctionsmonitor.dotnetbackend.tests
{

    class MockedTokenCredential : TokenCredential
    {
        public bool ShouldThrow = false;
        public readonly string ExceptionText = "Exception from MockedTableCredential";

        public override AccessToken GetToken(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            throw new NotImplementedException();
        }

        public override async ValueTask<AccessToken> GetTokenAsync(TokenRequestContext requestContext, CancellationToken cancellationToken)
        {
            if (this.ShouldThrow)
            {
                throw new Exception(ExceptionText);
            }

            // Making a token that expires 12 seconds from now
            const int expiresIn = 12;
            return new AccessToken(this._rnd.Next().ToString(), DateTimeOffset.UtcNow + TimeSpan.FromSeconds(expiresIn));
        }

        private readonly Random _rnd = new Random();
    }

    [TestClass]
    public class IdentityBasedTokenSourceTests
    {

        [TestMethod]
        public async Task ReturnsTokenAndRethrowsExceptions()
        {
            // Arrange

            var mockedTokenCredential = new MockedTokenCredential();
            IdentityBasedTokenSource.MockedTokenCredential = mockedTokenCredential;
            try
            {
                // Act

                // Should return the same token twice
                string token1 = await IdentityBasedTokenSource.GetTokenAsync();
                string token2 = await IdentityBasedTokenSource.GetTokenAsync();

                await Task.Delay(TimeSpan.FromSeconds(3));

                // At this point the first token should expire. 
                // Forcing the token generation method to throw.
                mockedTokenCredential.ShouldThrow = true;

                try
                {
                    string token3 = await IdentityBasedTokenSource.GetTokenAsync();

                    Assert.Fail("IdentityBasedTokenSource.GetTokenAsync() should have thrown");
                }
                catch(Exception ex)
                {
                    Assert.AreEqual(mockedTokenCredential.ExceptionText, ex.Message);
                }

                // Enabling token generation back
                mockedTokenCredential.ShouldThrow = false;

                // Making yet another token
                string token4 = await IdentityBasedTokenSource.GetTokenAsync();

                // Assert
                Assert.AreEqual(token1, token2);
                Assert.AreNotEqual(token2, token4);
            }
            finally
            {
                IdentityBasedTokenSource.MockedTokenCredential = null;
            }
        }

        [TestMethod]
        public void ReturnsDefaultAzureCredential()
        {
            var tokenCredential = IdentityBasedTokenSource.GetTokenCredential();

            // This is the only thing we can check
            Assert.IsNotNull(tokenCredential);

            Environment.SetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage + Globals.IdentityBasedConnectionSettingCredentialSuffix, Globals.IdentityBasedConnectionSettingCredentialValue);
            Environment.SetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage + Globals.IdentityBasedConnectionSettingClientIdSuffix, "10000000-0000-0000-0000-000000000001");

            var tokenCredential2 = IdentityBasedTokenSource.GetTokenCredential();

            // This is the only thing we can check
            Assert.IsNotNull(tokenCredential2);
        }
    }
}