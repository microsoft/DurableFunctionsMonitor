using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetBackend;
using System.Threading.Tasks;
using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.WebJobs;
using System.IO;
using System;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    [TestClass]
    public class ServeStaticsTests
    {
        [TestInitialize]
        public void TestInit()
        {
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, string.Empty);
        }
        
        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsIndexHtml()
        {
            // Arrange
            var request = new DefaultHttpContext().Request;

            var logMoq = new Mock<ILogger>();

            var executionContext = new ExecutionContext
            {
                FunctionAppDirectory = Directory.GetCurrentDirectory()
            };

            // Act
            var result = (ContentResult) await ServeStatics.DfmServeStaticsFunction(request, null, "arbitrary", "path", executionContext, logMoq.Object);

            // Assert

            Assert.AreEqual("text/html; charset=UTF-8", result.ContentType);
            Assert.IsTrue(result.Content.StartsWith("<!doctype html>"));
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsTestJsFile()
        {
            // Arrange
            var request = new DefaultHttpContext().Request;

            var logMoq = new Mock<ILogger>();

            var executionContext = new ExecutionContext
            {
                FunctionAppDirectory = Directory.GetCurrentDirectory()
            };

            string jsFileName = "test.js";
            string jsCode = "function abc() {}";

            File.WriteAllText(Path.Join(executionContext.FunctionAppDirectory, "DfmStatics", "static", "js", jsFileName), jsCode);

            // Act
            var result = (FileStreamResult) await ServeStatics.DfmServeStaticsFunction(request, "static", "js", jsFileName, executionContext, logMoq.Object);

            // Assert

            Assert.AreEqual("application/javascript; charset=UTF-8", result.ContentType);
            Assert.AreEqual(jsCode, new StreamReader(result.FileStream).ReadToEnd());
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturns404ForIncorrectPath()
        {
            // Arrange
            var request = new DefaultHttpContext().Request;

            var logMoq = new Mock<ILogger>();

            var executionContext = new ExecutionContext
            {
                FunctionAppDirectory = Directory.GetCurrentDirectory()
            };

            // Act
            var result = await ServeStatics.DfmServeStaticsFunction(request, "static", "js", @"..\..\..\host.json", executionContext, logMoq.Object);

            // Assert
            Assert.IsInstanceOfType(result, typeof(NotFoundResult));
        }

        [TestMethod]
        public async Task DfmServeStaticsFunctionReturnsUnauthorizedResultIfNonceIsInvalid()
        {
            // Arrange
            var request = new DefaultHttpContext().Request;

            var logMoq = new Mock<ILogger>();

            var executionContext = new ExecutionContext
            {
                FunctionAppDirectory = Directory.GetCurrentDirectory()
            };

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, $"my-nonce-{DateTime.Now}");

            // Act
            var result = await ServeStatics.DfmServeStaticsFunction(request, "a", "b", "c", executionContext, logMoq.Object);

            // Assert
            Assert.IsInstanceOfType(result, typeof(UnauthorizedResult));
        }
    }
}
