using Microsoft.VisualStudio.TestTools.UnitTesting;
using Microsoft.Extensions.Logging;
using DurableFunctionsMonitor.DotNetBackend;
using System.Threading.Tasks;
using Moq;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;
using System.Threading;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.ContextImplementations;
using Microsoft.Azure.WebJobs.Extensions.DurableTask.Options;

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

            var request = new DefaultHttpContext().Request;
            request.Headers["x-dfm-nonce"] = Shared.Nonce;

            var durableClientMoq = new Mock<IDurableClient>();

            var queryResult = new OrchestrationStatusQueryResult()
            {
                DurableOrchestrationState = new DurableOrchestrationStatus[0]
            };

            durableClientMoq
                .Setup(c => c.ListInstancesAsync(It.IsAny<OrchestrationStatusQueryCondition>(), It.IsAny<CancellationToken>()))
                .Returns(Task.FromResult(queryResult));

            var logMoq = new Mock<ILogger>();

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, Shared.Nonce);

            // Act

            var result = (ContentResult)(await new IdSuggestions(null).DfmGetIdSuggestionsFunction(request, durableClientMoq.Object, "-", "TestHub", "abc", logMoq.Object));

            // Assert

            Assert.AreEqual("application/json", result.ContentType);
            Assert.AreEqual("[]", result.Content);
        }

        [TestMethod]
        public async Task UsesAlternativeDurableClientForAlternativeConnection()
        {
            // Arrange

            var request = new DefaultHttpContext().Request;
            request.Headers["x-dfm-nonce"] = Shared.Nonce;

            var durableClientMoq = new Mock<IDurableClient>();

            var queryResult = new OrchestrationStatusQueryResult()
            {
                DurableOrchestrationState = new DurableOrchestrationStatus[0]
            };

            durableClientMoq
                .Setup(c => c.ListInstancesAsync(It.IsAny<OrchestrationStatusQueryCondition>(), It.IsAny<CancellationToken>()))
                .Returns(Task.FromResult(queryResult));

            var durableClientFactoryMoq = new Mock<IDurableClientFactory>();

            durableClientFactoryMoq.Setup(c => c.CreateClient(It.IsAny<DurableClientOptions>())).Returns(durableClientMoq.Object);


            var logMoq = new Mock<ILogger>();

            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_NONCE, Shared.Nonce);

            // Act

            var result = (ContentResult)(await new IdSuggestions(durableClientFactoryMoq.Object).DfmGetIdSuggestionsFunction(request, null, "alternative", "TestHub", "abc", logMoq.Object));

            // Assert

            Assert.AreEqual("application/json", result.ContentType);
            Assert.AreEqual("[]", result.Content);
        }
    }
}