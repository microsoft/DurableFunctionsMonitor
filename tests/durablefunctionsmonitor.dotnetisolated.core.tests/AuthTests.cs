// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using DurableFunctionsMonitor.DotNetIsolated;
using Microsoft.Azure.Functions.Worker;
using Microsoft.IdentityModel.Tokens;
using Microsoft.VisualStudio.TestTools.UnitTesting;

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
