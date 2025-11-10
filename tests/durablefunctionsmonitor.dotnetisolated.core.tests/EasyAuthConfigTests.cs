// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using Moq;
using System;
using Newtonsoft.Json;
using System.Text;
using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;
using System.IO;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class EasyAuthConfigTests
    {
        [TestMethod]
        public async Task ReturnsUnauthorizedResultIfNonceIsInvalid()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var logFactoryMoq = new Mock<ILoggerFactory>();
            logFactoryMoq
                .Setup(m => m.CreateLogger(It.IsAny<string>()))
                .Returns(Mock.Of<ILogger>());

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, $"my-nonce-{DateTime.Now}");

            // Act
            var task = new EasyAuthConfig(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object)
                .DfmGetEasyAuthConfigFunction(request);

            // Assert
            await Assert.ThrowsExceptionAsync<DfmUnauthorizedException>(() => task);
        }

        [TestMethod]
        public async Task ReturnsUserNameWhenServerDirectedLoginAndMsClientPrincipalHeaderIsPresent()
        {
            // Arrange
            var originalNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            var originalUnauthenticatedAction = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION);
            var originalSiteName = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME);
            var originalClientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);

            try
            {
                string nonce = $"my-nonce-{DateTime.Now.Ticks}";
                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, nonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, Auth.UnauthenticatedActionRedirectToLoginPage);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME, "test-site");
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, "test-client-id");

                var request = new FakeHttpRequestData(new Uri("http://localhost"));
                request.Headers.Add("x-dfm-nonce", nonce);

                var clientPrincipal = new
                {
                    auth_typ = "aad",
                    claims = new[]
                    {
                        new { typ = Auth.PreferredUserNameClaim, val = "testuser@example.com" }
                    }
                };

                var clientPrincipalJson = JsonConvert.SerializeObject(clientPrincipal);
                var headerValue = Convert.ToBase64String(Encoding.UTF8.GetBytes(clientPrincipalJson));

                request.Headers.Add("x-ms-client-principal", headerValue);

                var logFactoryMoq = new Mock<ILoggerFactory>();
                logFactoryMoq
                    .Setup(m => m.CreateLogger(It.IsAny<string>()))
                    .Returns(Mock.Of<ILogger>());

                var easyAuthConfig = new EasyAuthConfig(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object);

                // Act
                var response = await easyAuthConfig.DfmGetEasyAuthConfigFunction(request);
                response.Body.Position = 0;
                var reader = new StreamReader(response.Body);
                var responseBody = await reader.ReadToEndAsync();
                dynamic result = JObject.Parse(responseBody);

                // Assert
                Assert.AreEqual("testuser@example.com", (string)result.userName);
            }
            finally
            {
                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, originalNonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, originalUnauthenticatedAction);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_SITE_NAME, originalSiteName);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, originalClientId);
            }
        }

        [TestMethod]
        public async Task ReturnsUserNameWhenServerDirectedLoginAndRequestIdentityIsPresent()
        {
            // Arrange
            var originalNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            var originalUnauthenticatedAction = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION);

            try
            {
                string nonce = $"my-nonce-{DateTime.Now.Ticks}";
                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, nonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, Auth.UnauthenticatedActionRedirectToLoginPage);

                var request = new FakeHttpRequestData(new Uri("http://localhost"));
                request.Headers.Add("x-dfm-nonce", nonce);

                var identity = new ClaimsIdentity(new[] {
                    new Claim(Auth.PreferredUserNameClaim, "testuser@example.com")
                }, "TestAuthType");

                request.AddIdentity(identity);

                var logFactoryMoq = new Mock<ILoggerFactory>();
                logFactoryMoq
                    .Setup(m => m.CreateLogger(It.IsAny<string>()))
                    .Returns(Mock.Of<ILogger>());

                var easyAuthConfig = new EasyAuthConfig(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object);

                // Act
                var response = await easyAuthConfig.DfmGetEasyAuthConfigFunction(request);
                response.Body.Position = 0;
                var reader = new StreamReader(response.Body);
                var responseBody = await reader.ReadToEndAsync();
                dynamic result = JObject.Parse(responseBody);

                // Assert
                Assert.AreEqual("testuser@example.com", (string)result.userName);
            }
            finally
            {
                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, originalNonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, originalUnauthenticatedAction);
            }
        }

        [TestMethod]
        public async Task ReturnsUserNameWhenServerDirectedLoginAndAuthorizationHeaderIsPresent()
        {
            // Arrange
            var originalNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);
            var originalUnauthenticatedAction = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION);
            var originalClientId = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID);
            var originalIssuer = Environment.GetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER);

            var originalTokenHandler = Auth.MockedJwtSecurityTokenHandler;
            var originalSigningKeysTask = Auth.GetSigningKeysTask;

            try
            {
                string nonce = $"my-nonce-{DateTime.Now.Ticks}";
                string userName = "testuser@example.com";
                string audience = "my-audience";
                string issuer = "my-issuer";
                string token = "fake-jwt-token";

                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, nonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, Auth.UnauthenticatedActionRedirectToLoginPage);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, audience);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, issuer);

                var principal = new ClaimsPrincipal(new ClaimsIdentity([
                    new(Auth.PreferredUserNameClaim, userName)
                ], "TestAuthType"));

                SecurityToken st = null;
                var jwtHandlerMoq = new Mock<JwtSecurityTokenHandler>();
                jwtHandlerMoq
                    .Setup(h => h.ValidateToken(token, It.IsAny<TokenValidationParameters>(), out st))
                    .Returns(principal);

                Auth.MockedJwtSecurityTokenHandler = jwtHandlerMoq.Object;
                Auth.GetSigningKeysTask = Task.FromResult<ICollection<SecurityKey>>([]);

                var request = new FakeHttpRequestData(new Uri("http://localhost"));
                request.Headers.Add("x-dfm-nonce", nonce);
                request.Headers.Add("Authorization", $"Bearer {token}");

                var logFactoryMoq = new Mock<ILoggerFactory>();
                logFactoryMoq
                    .Setup(m => m.CreateLogger(It.IsAny<string>()))
                    .Returns(Mock.Of<ILogger>());

                var easyAuthConfig = new EasyAuthConfig(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object);

                // Act
                var response = await easyAuthConfig.DfmGetEasyAuthConfigFunction(request);
                response.Body.Position = 0;
                var reader = new StreamReader(response.Body);
                var responseBody = await reader.ReadToEndAsync();
                dynamic result = JObject.Parse(responseBody);

                // Assert
                Assert.AreEqual(userName, (string)result.userName);
            }
            finally
            {
                Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, originalNonce);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_UNAUTHENTICATED_ACTION, originalUnauthenticatedAction);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, originalClientId);
                Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, originalIssuer);

                Auth.MockedJwtSecurityTokenHandler = originalTokenHandler;
                Auth.GetSigningKeysTask = originalSigningKeysTask;
            }
        }
    }
}
