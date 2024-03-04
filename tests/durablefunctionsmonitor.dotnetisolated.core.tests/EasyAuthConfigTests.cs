// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using Moq;
using System;

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
    }
}
