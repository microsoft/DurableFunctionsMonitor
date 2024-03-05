// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using DurableFunctionsMonitor.DotNetIsolated;
using Microsoft.Azure.Functions.Worker;
using Microsoft.IdentityModel.Tokens;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class AuthTests
    {
        [TestInitialize]
        public void TestInit()
        {
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
        }

        [TestMethod]
        public void AllDfMonFunctionsHaveCtorThatTakesDfmSettingsAndDfmExtensionPoints()
        {
            // Arrange

            var allFunctionClasses = typeof(DfmSettings).Assembly.DefinedTypes
                .Where(
                    t => t.IsClass && 
                    t.GetMethods().Any(m => m.CustomAttributes.Any(a => a.AttributeType == typeof(FunctionAttribute)))
                );

            // Act

            // This ensures that DfMon's endpoints cannot be called without prior initializing DfMon with .UseDurableFunctionsMonitor()
            bool allHaveProperCtor = allFunctionClasses
                .All(c =>
                {
                    var ctorParams = c.GetConstructors().Single().GetParameters();

                    return 
                        ctorParams.Any(p => p.ParameterType == typeof(DfmSettings))
                        &&
                        ctorParams.Any(p => p.ParameterType == typeof(DfmExtensionPoints))
                    ;
                });

            // Assert

            Assert.IsTrue(allHaveProperCtor);
        }

        [TestMethod]
        public void AllNonPublicDfMonFunctionsAreMarkedWithOperationKindAttribute()
        {
            // Arrange

            var allFunctionMethods = typeof(DfmSettings).Assembly.DefinedTypes
                .Where(t => t.IsClass)
                .SelectMany(c => c.GetMethods().Where(m => m.CustomAttributes.Any(a => a.AttributeType == typeof(FunctionAttribute))))
            ;

            // Act

            // Only these two methods should be publicly accessible as of today
            var publicFunctions = new[] 
            { 
                nameof(ServeStatics.DfmServeStaticsFunction),
                nameof(EasyAuthConfig.DfmGetEasyAuthConfigFunction),
            };

            bool allMarkedWithOperationKindAttribute = allFunctionMethods
                .Where(m => !publicFunctions.Contains(m.Name))
                .All(m => m.CustomAttributes.Any(a => a.AttributeType == typeof(OperationKindAttribute)));

            // Assert

            Assert.IsTrue(allMarkedWithOperationKindAttribute);
        }


        [TestMethod]
        public void AllModifyingFunctionsAreMarkedAsOperationKindWrite()
        {
            // Arrange

            var allFunctionMethods = typeof(DfmSettings).Assembly.DefinedTypes
                .Where(t => t.IsClass)
                .SelectMany(c => c.GetMethods().Where(m => m.CustomAttributes.Any(a => a.AttributeType == typeof(FunctionAttribute))))
            ;

            // Act

            // These are reading methods
            var publicFunctions = new[]
            {
                nameof(ServeStatics.DfmServeStaticsFunction),
                nameof(EasyAuthConfig.DfmGetEasyAuthConfigFunction),
                nameof(About.DfmAboutFunction),
                nameof(FunctionMap.DfmGetFunctionMap),
                nameof(IdSuggestions.DfmGetIdSuggestionsFunction),
                nameof(ManageConnection.DfmGetConnectionInfoFunction),
                nameof(Orchestration.DfmGetOrchestrationFunction),
                nameof(Orchestration.DfmGetOrchestrationHistoryFunction),
                nameof(Orchestration.DfmGetOrchestrationTabMarkupFunction),
                nameof(Orchestrations.DfmGetOrchestrationsFunction),
                nameof(TaskHubNames.DfmGetTaskHubNamesFunction)
            };

            var allWritingMethods = allFunctionMethods
                .Where(m => !publicFunctions.Contains(m.Name))
                .ToList();

            var list = allWritingMethods
                .SelectMany(m => m.CustomAttributes.Where(a => a.AttributeType == typeof(OperationKindAttribute)))
                .Select(a => (OperationKind)a.NamedArguments.Single().TypedValue.Value)
                .ToList();

            var allMarkedWithOperationKindWrite = allWritingMethods
                .All(m => m.CustomAttributes.Any(a => 
                    a.AttributeType == typeof(OperationKindAttribute) &&
                    (OperationKind)a.NamedArguments.Single().TypedValue.Value == OperationKind.Write
                ));

            // Assert

            Assert.IsTrue(allMarkedWithOperationKindWrite);
        }

        [TestMethod]
        public void ReturnsUnauthorizedResultIfTaskHubNotAllowed()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost/a/p/i/--InvalidHubName/about"));

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, "Hub1,Hub2,Hub3");

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));
            Assert.AreEqual(task.Exception.InnerException.Message, "Task Hub 'InvalidHubName' is not allowed.");
        }

        [TestMethod]
        public void ReturnsBadRequestResultIfTaskHubNameIsInvalid()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost/a/p/i/--bad'hub|name/about"));

            // Act
            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert
            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));
            Assert.AreEqual(task.Exception.InnerException.Message, "Task Hub name is invalid.");
        }

        [TestMethod]
        public async Task RespectsTaskHubNameFromHostJson()
        {
            // Arrange

            var hubName = $"HubName{DateTime.Now.Ticks}";

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--{hubName}/about"));

            await File.WriteAllTextAsync("../host.json", $"{{\"extensions\":{{\"durableTask\": {{\"hubName\": \"{hubName}\"}}}}}}");

            // Act
            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));
            Assert.AreEqual(task.Exception.InnerException.Message, "XSRF token is missing.");

            File.Delete("../host.json");
        }

        [TestMethod]
        public async Task RespectsTaskHubNameEnvVariableFromHostJson()
        {
            // Arrange

            var hubName = $"HubName{DateTime.Now.Ticks}";
            var hubNameVariable = $"HubNameEnvVariable{DateTime.Now.Ticks}";

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--{hubName}/about"));
            request.Headers.Add("Authorization", "Bearer blah-blah");

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            await File.WriteAllTextAsync("../host.json", $"{{\"extensions\":{{\"durableTask\": {{\"hubName\": \"%{hubNameVariable}%\"}}}}}}");
            Environment.SetEnvironmentVariable(hubNameVariable, hubName);

            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, $"SomeClientId{DateTime.Now}");
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, string.Empty);

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));
            Assert.AreEqual(
                "Specify the Valid Issuer value via 'WEBSITE_AUTH_OPENID_ISSUER' config setting. Typically it looks like 'https://login.microsoftonline.com/<your-aad-tenant-id>/v2.0'.",
                task.Exception.InnerException.Message
            );

            File.Delete("../host.json");
        }

        [TestMethod]
        public void ReturnsUnauthorizedResultIfUserNotWhitelisted()
        {
            // Arrange

            var request = new FakeHttpRequestData(new Uri($"http://localhost"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, "user1@contoso.com,user2@contoso.com");

            request.AddIdentity(new ClaimsIdentity(new Claim[] {
                new Claim("preferred_username", userName)
            }));

            // Act
            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert
            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));

            Assert.AreEqual(
                $"User {userName} is not mentioned in {EnvVariableNames.DFM_ALLOWED_USER_NAMES} config setting. Call is rejected",
                task.Exception.InnerException.Message
            );
        }

        [TestMethod]
        public void ReturnsUnauthorizedResultIfUserIsNotInAppRole()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--TestHub/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, "");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, "role1,role2");

            request.AddIdentity(new ClaimsIdentity(new Claim[] {
                new Claim("preferred_username", userName)
            }));

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));

            Assert.AreEqual(
                $"User {userName} doesn't have any of roles mentioned in {EnvVariableNames.DFM_ALLOWED_APP_ROLES} or {EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES} config setting. Call is rejected",
                task.Exception.InnerException.Message
            );
        }

        [TestMethod]
        public void ReturnsUnauthorizedResultIfUserIsNotInReadOnlyRole()
        {
            // Arrange

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--TestHub/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES, "role1,role2");

            request.AddIdentity(new ClaimsIdentity(new Claim[] {
                new Claim("preferred_username", userName)
            }));

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));

            Assert.AreEqual(
                $"User {userName} doesn't have any of roles mentioned in {EnvVariableNames.DFM_ALLOWED_APP_ROLES} or {EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES} config setting. Call is rejected",
                task.Exception.InnerException.Message
            );
        }

        [TestMethod]
        public async Task ReturnsAuthorizedIfUserIsInAppRole()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--TestHub/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, "role1,role2");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES, string.Empty);

            request.AddIdentity(new ClaimsIdentity(new Claim[] {
                new Claim("preferred_username", userName),
                new Claim("roles", "role1")
            }));

            // Act

            var result = await Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.AreEqual(DfmMode.Normal, result);
        }

        [TestMethod]
        public async Task ReturnsAuthorizedIfUserIsInReadOnlyAppRole()
        {
            // Arrange

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--TestHub/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES, "readonly_role1,readonly_role2");

            request.AddIdentity(new ClaimsIdentity(new Claim[] {
                new Claim("preferred_username", userName),
                new Claim("roles", "readonly_role1")
            }));

            // Act

            var result = await Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.AreEqual(DfmMode.ReadOnly, result);
        }

        // The only way to define a callback for ValidateToken() method
        delegate void ValidateTokenDelegate(string a, TokenValidationParameters p, out SecurityToken t);

        [TestMethod]
        public async Task ValidatesTokenWithoutEasyAuthsHelp()
        {
            // Arrange

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--TestHub/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            string userName = "tino@contoso.com";
            string roleName = "my-app-role";
            string audience = "my-audience";
            string issuer = "my-issuer";
            string token = "blah-blah";

            var principal = new ClaimsPrincipal(new ClaimsIdentity[] { new ClaimsIdentity( new Claim[] {
                new Claim("preferred_username", userName),
                new Claim("roles", roleName)
            })});

            ICollection<SecurityKey> securityKeys = new SecurityKey[0];

            ValidateTokenDelegate validateTokenDelegate = (string t, TokenValidationParameters p, out SecurityToken st) =>
            {
                st = null;

                Assert.AreEqual(token, t);
                Assert.AreEqual(audience, p.ValidAudiences.Single());
                Assert.AreEqual(issuer, p.ValidIssuers.Single());
                Assert.AreEqual(securityKeys, p.IssuerSigningKeys);
            };

            SecurityToken st = null;
            var jwtHandlerMoq = new Mock<JwtSecurityTokenHandler>();
            jwtHandlerMoq.Setup(h => h.ValidateToken(It.IsAny<string>(), It.IsAny<TokenValidationParameters>(), out st))
                .Callback(validateTokenDelegate)
                .Returns(principal);

            Auth.MockedJwtSecurityTokenHandler = jwtHandlerMoq.Object;
            Auth.GetSigningKeysTask = Task.FromResult(securityKeys);

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, audience);
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, issuer);

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, "user1@contoso.com,user2@contoso.com," + userName);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, roleName);
            Environment.SetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage, token);

            request.Headers.Add("Authorization", "Bearer " + token);

            // Act
            var result = await Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert
            Assert.AreEqual(DfmMode.Normal, result);
        }

        [TestMethod]
        public void LoadsListOfTablesFromTableStorage()
        {
            // Arrange

            string hubName = "InvalidHubName";

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/--{hubName}/about"));

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);

            var tableClientMoq = new Mock<ITableClient>();

            tableClientMoq.Setup(c => c.ListTableNamesAsync())
                .Returns(Task.FromResult<IEnumerable<string>>(new string[] {
                    "Hub1Instances","Hub1History",
                    "Hub2Instances","Hub2History"
                }));

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));

            // If TableClient throws, task hub validation should be skipped, and we should get 'No access token provided'.
            Assert.AreEqual(
                "No access token provided. Call is rejected.",
                task.Exception.InnerException.Message
            );

            // Now initializing TableClient
            TableClient.MockedTableClient = tableClientMoq.Object;

            task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());
            Thread.Sleep(100);
            task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            TableClient.MockedTableClient = null;

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));

            // Now when MockedTableClient is set, we should get 'Task Hub is not allowed'.
            // This also validates that queries against table storage are properly retried.
            Assert.AreEqual(
                $"Task Hub '{hubName}' is not allowed.",
                task.Exception.InnerException.Message
            );
        }


        [TestMethod]
        public void LoadsListOfTablesFromAlternativeStorage()
        {
            // Arrange

            string connName = "MyConnStringName";
            string hubName = "Hub2";

            var request = new FakeHttpRequestData(new Uri($"http://localhost/a/p/i/{connName}-{hubName}/about"));

            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, $"xsrf-token-one-{DateTime.Now.Ticks}");
            request.AddCookie(Globals.XsrfTokenCookieAndHeaderName, $"xsrf-token-two-{DateTime.Now.Second}");

            Auth.AlternativeConnectionStringNames = new[] { connName };

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);

            var tableClientMoq = new Mock<ITableClient>();

            tableClientMoq.Setup(c => c.ListTableNamesAsync())
                .Returns(Task.FromResult<IEnumerable<string>>(new string[] {
                    "Hub1Instances","Hub1History",
                    "Hub2Instances","Hub2History"
                }));

            TableClient.MockedTableClient = tableClientMoq.Object;

            // Act

            var task = Auth.ValidateIdentityAsync(request, OperationKind.Read, new DfmSettings(), new DfmExtensionPoints());

            // Assert

            Assert.IsInstanceOfType(task.Exception.InnerException, typeof(DfmUnauthorizedException));
            Assert.AreEqual(
                "XSRF tokens do not match.",
                task.Exception.InnerException.Message
            );

            TableClient.MockedTableClient = null;
        }

        [TestMethod]
        public void RetriesGettingSigningKeys()
        {
            // Arrange
            var initialFailedTask = Task.FromException<ICollection<SecurityKey>>(new Exception("Something failed"));
            Auth.GetSigningKeysTask = initialFailedTask;

            // Act
            var resultTask = Auth.InitGetSigningKeysTask(1, 1);
            Thread.Sleep(100);

            // Assert
            Assert.AreNotEqual(initialFailedTask, resultTask);
            Assert.AreNotEqual(initialFailedTask, Auth.GetSigningKeysTask);
        }

        [TestMethod]
        public void RetriesGettingSigningKeysNoMoreThan2Times()
        {
            // Arrange
            var initialFailedTask = Task.FromException<ICollection<SecurityKey>>(new Exception("Something failed"));
            Auth.GetSigningKeysTask = initialFailedTask;

            // Act
            var resultTask = Auth.InitGetSigningKeysTask(1, 2);
            Thread.Sleep(100);

            // Assert
            Assert.AreNotEqual(initialFailedTask, resultTask);
            Assert.AreEqual(initialFailedTask, Auth.GetSigningKeysTask);
        }

        [TestMethod]
        public void CachesSigningKeysAndAutomaticallyRefreshesTheCache()
        {
            // Arrange

            // Just using a shared metadata endpoint, to make the first task succeed
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, "https://login.microsoftonline.com/common");

            // Initializing the key retrieval task so, that it resets itself in 1 second
            var initialTask = Auth.InitGetSigningKeysTask(1);
            Auth.GetSigningKeysTask = initialTask;

            // Resetting the issuer to an invalid value, to make second task fail
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, "invalid-issuer");

            // Act
            Thread.Sleep(3000);
            var finalTask = Auth.GetSigningKeysTask;

            // Assert
            Assert.AreNotEqual(initialTask, finalTask);
            Assert.IsTrue(initialTask.IsCompletedSuccessfully);
            Assert.IsTrue(finalTask.IsFaulted);
        }

        [TestMethod]
        public void ExtractsAlternativeConnectionStringNamesFromEnvironmentVariables()
        {
            // Arrange

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX + "one", "123");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX + "two", "456");
            Environment.SetEnvironmentVariable("NOT_" + EnvVariableNames.DFM_ALTERNATIVE_CONNECTION_STRING_PREFIX + "one", "789");

            // Act

            var connStringNames = Auth.GetAlternativeConnectionStringNames().ToArray();

            // Assert
            Assert.AreEqual(2, connStringNames.Length);
            Assert.IsTrue(connStringNames.Contains("one"));
            Assert.IsTrue(connStringNames.Contains("two"));
        }

        [TestMethod]
        public async Task GetAllowedTaskHubNamesAsyncReturnsNullIfNamesCannotBeFetchedFromStorage()
        {
            // Arrange

            var extensionPoints = new DfmExtensionPoints();

            // Act

            var hubNames = await Auth.GetAllowedTaskHubNamesAsync(extensionPoints);

            // Assert
            Assert.IsNull(hubNames);
        }

        [TestMethod]
        public async Task ReturnsTaskHubNamesAsCaseInsensitiveHashSet()
        {
            // Arrange

            var extensionPoints = new DfmExtensionPoints();

            extensionPoints.GetTaskHubNamesRoutine = async unused => new[] { "MyTaskHub" };

            // Act

            var hubNames = await Auth.GetAllowedTaskHubNamesAsync(extensionPoints);

            // Assert

            Assert.IsTrue(hubNames.Contains("mYtASKhUB"));
        }

        [TestMethod]
        public async Task Returns_DFM_HUB_NAME_AsCaseInsensitiveHashSet()
        {
            // Arrange

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, "MyTaskHub");

            var extensionPoints = new DfmExtensionPoints();

            // Act

            var hubNames = await Auth.GetAllowedTaskHubNamesAsync(extensionPoints);

            // Assert

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);

            Assert.IsTrue(hubNames.Contains("mYtASKhUB"));
        }

        [TestMethod]
        public async Task ReturnsHubNameFromHostJsonAsCaseInsensitiveHashSet()
        {
            // Arrange

            await File.WriteAllTextAsync("./host.json", $"{{\"extensions\":{{\"durableTask\": {{\"hubName\": \"MyTaskHub\"}}}}}}");

            var extensionPoints = new DfmExtensionPoints();

            // Act

            var hubNames = await Auth.GetAllowedTaskHubNamesAsync(extensionPoints);

            // Assert

            File.Delete("./host.json");

            Assert.IsTrue(hubNames.Contains("mYtASKhUB"));
        }
    }
}
