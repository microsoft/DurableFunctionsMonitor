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
        public async Task HandleAuthAndErrorsReturnsUnauthorizedResultIfNotAuthenticated()
        {
            // Arrange

            var request = new DefaultHttpContext().Request;
            request.Headers.Add("Authorization", "Bearer blah-blah-blah");

            string xsrfToken = $"xsrf-token-{DateTime.Now.Ticks}";
            request.Headers.Add("Cookie", new CookieHeaderValue(Globals.XsrfTokenCookieAndHeaderName, xsrfToken).ToString());
            request.Headers.Add(Globals.XsrfTokenCookieAndHeaderName, xsrfToken);

            var logMoq = new Mock<ILogger>();

            logMoq.Setup(log => log.Log(It.IsAny<LogLevel>(), It.IsAny<EventId>(), It.IsAny<It.IsAnyType>(), It.IsAny<Exception>(), It.IsAny<Func<It.IsAnyType, Exception, string>>()))
                .Callback((LogLevel l, EventId i, object s, Exception ex, object o) =>
                {
                    // Ensuring the correct type of exception was raised internally
                    Assert.IsInstanceOfType(ex, typeof(UnauthorizedAccessException));
                    Assert.AreEqual("Specify the Valid Audience value via 'WEBSITE_AUTH_CLIENT_ID' config setting. Typically it is the ClientId of your AAD application.", ex.Message);
                });

            // Act

            var res = await Globals.HandleAuthAndErrors(request, OperationKind.Read, null, null, logMoq.Object, async mode => {
                return new OkResult();
            });

            // Assert
            Assert.IsInstanceOfType(res, typeof(UnauthorizedResult));
        }

        class MyTestException : Exception 
        {
            public MyTestException(string msg) : base(msg) { }
        }

        [TestMethod]
        public async Task HandleAuthAndErrorsReturnsBadRequestObjectResultUponFailure()
        {
            // Arrange

            var myErrorMessage = "Test Error Message";

            var myNonce = Shared.Nonce;

            var request = new DefaultHttpContext().Request;
            request.Headers.Add("x-dfm-nonce", myNonce);

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, myNonce);

            var logMoq = new Mock<ILogger>();

            logMoq.Setup(log => log.Log(It.IsAny<LogLevel>(), It.IsAny<EventId>(), It.IsAny<It.IsAnyType>(), It.IsAny<Exception>(), It.IsAny<Func<It.IsAnyType, Exception, string>>()))
                .Callback((LogLevel l, EventId i, object s, Exception ex, object o) =>
                {
                    // Ensuring the correct type of exception was raised internally
                    Assert.IsInstanceOfType(ex, typeof(MyTestException));
                    Assert.AreEqual(myErrorMessage, ex.Message);
                });

            // Act

            var res = (BadRequestObjectResult) (await Globals.HandleAuthAndErrors(request, OperationKind.Read, null, null, logMoq.Object, async mode => {
                throw new MyTestException(myErrorMessage);
            }));

            // Assert

            Assert.AreEqual(myErrorMessage, res.Value);
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