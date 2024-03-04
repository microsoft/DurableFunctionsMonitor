// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using System;
using System.IO;
using System.Linq;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class IdSuggestionsTests
    {
        [TestInitialize]
        public void TestInit()
        {
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            TableClient.MockedTableClient = null;
        }

        [TestMethod]
        public async Task UsesDefaultDurableClientForDefaultConnection()
        {
            // Arrange

            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var durableClient = new FakeDurableTaskClient();

            // Act

            var result = await new IdSuggestions(new DfmSettings(), new DfmExtensionPoints())
                .DfmGetIdSuggestionsFunction(request, durableClient, "-", "TestHub", "abc");

            // Assert

            Assert.AreEqual("application/json", result.Headers.GetValues("Content-Type").Single());

            result.Body.Seek(0, SeekOrigin.Begin);
            using (var reader = new StreamReader(result.Body))
            {
                Assert.AreEqual("[]", reader.ReadToEnd());
            }
        }
    }
}