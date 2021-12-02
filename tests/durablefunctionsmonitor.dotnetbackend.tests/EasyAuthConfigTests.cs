// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetBackend;
using System.Threading.Tasks;
using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
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
            var request = new DefaultHttpContext().Request;

            var logMoq = new Mock<ILogger>();

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, $"my-nonce-{DateTime.Now}");

            // Act
            var result = await EasyAuthConfig.DfmGetEasyAuthConfigFunction(request, logMoq.Object);

            // Assert
            Assert.IsInstanceOfType(result, typeof(UnauthorizedResult));
        }
    }
}
