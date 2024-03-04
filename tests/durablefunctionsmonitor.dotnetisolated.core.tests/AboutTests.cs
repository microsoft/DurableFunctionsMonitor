// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using System;
using Newtonsoft.Json;
using System.IO;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class AboutTests
    {
        [TestMethod]
        public async Task DfmAboutFunctionSucceeds()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            Environment.SetEnvironmentVariable(EnvVariableNames.AzureWebJobsStorage, "blah-blah AccountName=Tino; blah-blah");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, "Hub1,Hub2,Hub3");

            request.FunctionContext.Items[Globals.DfmModeContextValue] = DfmMode.Normal;

            // Act
            var result = await new About(new DfmSettings(), new DfmExtensionPoints())
                .DfmAboutFunction(request, "-", "Hub1", request.FunctionContext);

            // Assert

            result.Body.Seek(0, SeekOrigin.Begin);
            using (var reader = new StreamReader(result.Body))
            {
                dynamic resultJson = JsonConvert.DeserializeObject(reader.ReadToEnd());

                Assert.AreEqual("Tino", resultJson.accountName.ToString());
                Assert.AreEqual("Hub1", resultJson.hubName.ToString());
            }
        }
    }
}
