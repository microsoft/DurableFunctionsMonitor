// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetIsolated;
using System.Threading.Tasks;
using Moq;
using System.IO;
using System;
using System.Linq;
using System.Net;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class ServeStaticsTests
    {
        [TestInitialize]
        public void TestInit()
        {
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, string.Empty);

            Shared.CopyFolder(Path.Join("..", "..", "..", "..", "..", "durablefunctionsmonitor.dotnetisolated", "DfmStatics"), "DfmStatics");
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsIndexHtml()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var logFactoryMoq = new Mock<ILoggerFactory>();
            logFactoryMoq
                .Setup(m => m.CreateLogger(It.IsAny<string>()))
                .Returns(Mock.Of<ILogger>());

            // Act
            var result = await new ServeStatics(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object)
                .DfmServeStaticsFunction(request, null, "arbitrary", "path");

            // Assert

            Assert.AreEqual("text/html; charset=UTF-8", result.Headers.GetValues("Content-Type").Single());

            result.Body.Seek(0, SeekOrigin.Begin);
            using (var reader = new StreamReader(result.Body))
            {
                string content = reader.ReadToEnd();
                Assert.IsTrue(content.StartsWith("<!doctype html>"));
            }
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsTestJsFile()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var logFactoryMoq = new Mock<ILoggerFactory>();
            logFactoryMoq
                .Setup(m => m.CreateLogger(It.IsAny<string>()))
                .Returns(Mock.Of<ILogger>());

            string jsFileName = "test.js";
            string jsCode = "function abc() {}";

            File.WriteAllText(Path.Join(Environment.CurrentDirectory, "DfmStatics", "static", "js", jsFileName), jsCode);

            // Act
            var result = await new ServeStatics(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object)
                .DfmServeStaticsFunction(request, "static", "js", jsFileName);

            // Assert

            Assert.AreEqual("application/javascript; charset=UTF-8", result.Headers.GetValues("Content-Type").Single());

            result.Body.Seek(0, SeekOrigin.Begin);
            using (var reader = new StreamReader(result.Body))
            {
                Assert.AreEqual(jsCode, reader.ReadToEnd());
            }
        }


        [TestMethod]
        public async Task DfmServeStaticsFunctionReturns404ForIncorrectPath()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var logFactoryMoq = new Mock<ILoggerFactory>();
            logFactoryMoq
                .Setup(m => m.CreateLogger(It.IsAny<string>()))
                .Returns(Mock.Of<ILogger>());

            // Act
            var result = await new ServeStatics(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object)
                .DfmServeStaticsFunction(request, "static", "js", @"..\..\..\..\..\durablefunctionsmonitor.dotnetisolated\host.json");

            // Assert
            Assert.AreEqual(result.StatusCode, HttpStatusCode.NotFound);
            Assert.AreEqual(result.Body.Length, 0);
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsUnauthorizedResultIfNonceIsInvalid()
        {
            // Arrange
            var request = new FakeHttpRequestData(new Uri("http://localhost"));

            var logFactoryMoq = new Mock<ILoggerFactory>();
            logFactoryMoq
                .Setup(m => m.CreateLogger(It.IsAny<string>()))
                .Returns(Mock.Of<ILogger>());

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, $"my-nonce-{DateTime.Now}");

            // Act
            var task = new ServeStatics(new DfmSettings(), new DfmExtensionPoints(), logFactoryMoq.Object)
                    .DfmServeStaticsFunction(request, "a", "b", "c");

            // Assert
            await Assert.ThrowsExceptionAsync<DfmUnauthorizedException>(() => task);
        }
    }
}
