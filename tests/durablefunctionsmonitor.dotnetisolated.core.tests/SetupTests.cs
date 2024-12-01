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
    public class SetupTests
    {
        [TestMethod]
        public void ThrowErrorIfAppRolesOverlapInConfiguration()
        {
            // Arrange
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_HUB_NAME, string.Empty);
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES, "");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES, "role1,role2");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_FULL_ACCESS_APP_ROLES, "role2");
            Environment.SetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES, "");

            // Act & Assert
            Assert.ThrowsException<System.NotSupportedException>(() => {
                new DfmSettings();
            });
        }
    }
}
