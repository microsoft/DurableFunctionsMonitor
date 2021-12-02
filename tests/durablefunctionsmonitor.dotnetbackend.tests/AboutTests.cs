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
using Newtonsoft.Json;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class AboutTests
    {
        [TestMethod]
        public async Task DfmAboutFunctionSucceeds()
        {
            // Arrange
            var request = new DefaultHttpContext().Request;
            request.Headers["x-dfm-nonce"] = Shared.Nonce;

            var logMoq = new Mock<ILogger>();

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, Shared.Nonce);
            Environment.SetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage, "blah-blah AccountName=Tino; blah-blah");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, "Hub1,Hub2,Hub3");

            // Act
            var result = (ContentResult) await About.DfmAboutFunction(request, "-", "Hub1", logMoq.Object);

            // Assert
            dynamic resultJson = JsonConvert.DeserializeObject(result.Content);

            Assert.AreEqual("Tino", resultJson.accountName.ToString());
            Assert.AreEqual("Hub1", resultJson.hubName.ToString());
        }
    }
}
