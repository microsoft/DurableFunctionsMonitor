// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using Moq;
using System;
using System.Net.Http.Headers;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class GlobalsTest
    {
        [TestInitialize]
        public void TestInit()
        {
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_CLIENT_ID, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.WEBSITE_AUTH_OPENID_ISSUER, string.Empty);
        }

        [TestMethod]
        public void CombineConnNameAndHubNameWorksAsExpected()
        {
            // Arrange

            string hubName = $"hub{DateTime.Now.Ticks}";
            string connName = $"my-conn-string-name{DateTime.Now.Ticks}";

            // Act

            string s1 = Globals.CombineConnNameAndHubName(null, hubName);
            string s2 = Globals.CombineConnNameAndHubName("", hubName);
            string s3 = Globals.CombineConnNameAndHubName("-", hubName);
            string s4 = Globals.CombineConnNameAndHubName(connName, hubName);

            // Assert
            Assert.AreEqual(hubName, s1);
            Assert.AreEqual(hubName, s2);
            Assert.AreEqual(hubName, s3);
            Assert.AreEqual(connName + "-" + hubName, s4);
        }
    }
}