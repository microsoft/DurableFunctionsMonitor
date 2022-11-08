// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Microsoft.Azure.WebJobs.Extensions.DurableTask;

namespace DurableFunctionsMonitor.DotNetBackend
{
    /// <summary>
    /// Defines functional mode for DurableFunctionsMonitor endpoint.
    /// </summary>
    public enum DfmMode
    {
        Normal = 0,
        ReadOnly
    }

    /// <summary>
    /// DurableFunctionsMonitor configuration settings
    /// </summary>
    public class DfmSettings
    {
        /// <summary>
        /// Turns authentication off for DurableFunctionsMonitor endpoint.
        /// WARNING: this might not only expose DurableFunctionsMonitor to the public, but also
        /// expose all other HTTP-triggered endpoints in your project. Make sure you know what you're doing.
        /// </summary>
        public bool DisableAuthentication { get; set; }

        /// <summary>
        /// Functional mode for DurableFunctionsMonitor endpoint.
        /// Currently only Normal (default) and ReadOnly modes are supported.
        /// </summary>
        public DfmMode Mode { get; set; }

        /// <summary>
        /// List of App Roles, that are allowed to access DurableFunctionsMonitor endpoint. Users/Groups then need 
        /// to be assigned one of these roles via AAD Enterprise Applications->[your AAD app]->Users and Groups tab.
        /// Once set, the incoming access token is expected to contain one of these in its 'roles' claim.
        /// </summary>
        public IEnumerable<string> AllowedAppRoles { get; set; }

        /// <summary>
        /// List of App Roles, that are allowed read only access to the DurableFunctionsMonitor endpoint. Users/Groups then need 
        /// to be assigned one of these roles via AAD Enterprise Applications->[your AAD app]->Users and Groups tab.
        /// Once set, the incoming access token is expected to contain one of these in its 'roles' claim.
        /// </summary>
        public IEnumerable<string> AllowedReadOnlyAppRoles { get; set; }

        /// <summary>
        /// List of users, that are allowed to access DurableFunctionsMonitor endpoint. You typically put emails into here.
        /// Once set, the incoming access token is expected to contain one of these names in its 'preferred_username' claim.
        /// </summary>
        public IEnumerable<string> AllowedUserNames { get; set; }

        /// <summary>
        /// Folder where to search for custom tab/html templates.
        /// Must be a part of your Functions project and be adjacent to your host.json file.
        /// </summary>
        public string CustomTemplatesFolderName { get; set; }

        /// <summary>
        /// Name of the claim (from ClaimsCredential) to be used as a user name.
        /// Defaults to "preferred_username"
        /// </summary>
        public string UserNameClaimName { get; set; }

        /// <summary>
        /// Name of the claim (from ClaimsCredential) to be used as a role name.
        /// Defaults to "roles"
        /// </summary>
        public string RolesClaimName { get; set; }

        public DfmSettings()
        {
            this.UserNameClaimName = Auth.PreferredUserNameClaim;
            this.RolesClaimName = Auth.RolesClaim;
        }
    }

    /// <summary>
    /// A set of extension points that can be customized by the client code, when DFM is used in 'injected' mode.
    /// </summary>
    public class DfmExtensionPoints
    {
        /// <summary>
        /// Routine for fetching orchestration history.
        /// Takes IDurableClient, connString env variable name, taskHubName and instanceId and returns IEnumerable[HistoryEvent].
        /// Provide your own implementation for a custom storage provider.
        /// Default implementation fetches history directly from XXXHistory table.
        /// </summary>
        public Func<IDurableClient, string, string, string, Task<IEnumerable<HistoryEvent>>> GetInstanceHistoryRoutine { get; set; }

        /// <summary>
        /// Routine for getting parent orchestration's Id.
        /// Takes IDurableClient, connString env variable name, taskHubName and instanceId and returns
        /// Id of parent orchestration, or null if the given instance is not a suborchestration.
        /// Provide your own implementation for a custom storage provider.
        /// Default implementation matches ExecutionId field in XXXInstances table.
        /// </summary>
        public Func<IDurableClient, string, string, string, Task<string>> GetParentInstanceIdRoutine { get; set; }

        public DfmExtensionPoints()
        {
            this.GetInstanceHistoryRoutine = OrchestrationHistory.GetHistoryDirectlyFromTable;
            this.GetParentInstanceIdRoutine = DetailedOrchestrationStatus.GetParentInstanceIdDirectlyFromTable;
        }
    }

    /// <summary>
    /// DurableFunctionsMonitor configuration
    /// </summary>
    public static class DfmEndpoint
    {
        /// <summary>
        /// Initializes DurableFunctionsMonitor endpoint with some settings
        /// </summary>
        /// <param name="settings">When null, default settings are used</param>
        /// <param name="extensionPoints">Routines, that can be customized by client code. When null, default instance of DfmExtensionPoints is used</param>
        public static void Setup(DfmSettings settings = null, DfmExtensionPoints extensionPoints = null)
        {
            string dfmNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);

            _settings = settings;
            
            if (_settings == null)
            {
                string dfmAllowedUserNames = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_USER_NAMES);
                string dfmAllowedAppRoles = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_APP_ROLES);
                string dfmAllowedreadOnlyAppRoles = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES);
                string dfmMode = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_MODE);
                string dfmUserNameClaimName = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_USERNAME_CLAIM_NAME);
                string dfmRolesClaimName = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_ROLES_CLAIM_NAME);

                var allowedAppRoles = dfmAllowedAppRoles == null ? null : dfmAllowedAppRoles.Split(',');
                var allowedReadOnlyAppRoles = dfmAllowedreadOnlyAppRoles == null ? null : dfmAllowedreadOnlyAppRoles.Split(',');
                if (allowedAppRoles != null && allowedReadOnlyAppRoles != null)
                {
                    // Validating that same app role does not appear in both settings
                    if (allowedAppRoles.Intersect(allowedReadOnlyAppRoles).Any())
                    {
                        throw new NotSupportedException($"{EnvVariableNames.DFM_ALLOWED_APP_ROLES} and {EnvVariableNames.DFM_ALLOWED_READ_ONLY_APP_ROLES} should not intersect");
                    }
                }

                _settings = new DfmSettings()
                {
                    // Don't want to move the below initializatin to DfmSettings's ctor. The idea is: either _everything_ comes 
                    // from env variables or _everything_ is configured programmatically. To avoid unclarity we shouldn't mix these two approaches.
                    DisableAuthentication = dfmNonce == Auth.ISureKnowWhatIAmDoingNonce,
                    Mode = dfmMode == DfmMode.ReadOnly.ToString() ? DfmMode.ReadOnly : DfmMode.Normal,
                    AllowedUserNames = dfmAllowedUserNames == null ? null : dfmAllowedUserNames.Split(','),
                    AllowedAppRoles = allowedAppRoles,
                    AllowedReadOnlyAppRoles = allowedReadOnlyAppRoles,
                    UserNameClaimName = string.IsNullOrEmpty(dfmUserNameClaimName) ? Auth.PreferredUserNameClaim : dfmUserNameClaimName,
                    RolesClaimName = string.IsNullOrEmpty(dfmRolesClaimName) ? Auth.RolesClaim : dfmRolesClaimName
                };
            }

            if (extensionPoints != null)
            {
                _extensionPoints = extensionPoints;
            }

            // Also initializing CustomUserAgent value based on input parameters
            if (!string.IsNullOrEmpty(dfmNonce) && (dfmNonce != Auth.ISureKnowWhatIAmDoingNonce))
            {
                _customUserAgent = $"DurableFunctionsMonitor-VsCodeExt/{GetVersion()}";
            }
            else
            {
                _customUserAgent = $"DurableFunctionsMonitor-Injected/{GetVersion()}";
            }
        }

        internal static DfmSettings Settings 
        {
            get 
            {
                if (_settings != null)
                {
                    return _settings;
                }

                if (!AreWeInStandaloneMode())
                {
                    throw new InvalidOperationException("Make sure you called DfmEndpoint.Setup() in your code");
                }

                DfmEndpoint.Setup();

                // Need to reinitialize CustomUserAgent
                _customUserAgent = $"DurableFunctionsMonitor-Standalone/{GetVersion()}";

                return _settings; 
            }
        }

        internal static DfmExtensionPoints ExtensionPoints 
        { 
            get { return _extensionPoints; } 
        }

        internal static string CustomUserAgent
        {
            get { return _customUserAgent; }
        }

        private static DfmSettings _settings = null;
        private static DfmExtensionPoints _extensionPoints = new DfmExtensionPoints();
        private static string _customUserAgent;

        /// <summary>
        /// Checks whether we should do our internal initialization (Standalone mode)
        /// or throw an exception when not initialized (Injected mode)
        /// </summary>
        private static bool AreWeInStandaloneMode()
        {
            string assemblyLocation = Assembly.GetExecutingAssembly().Location;
            if (string.IsNullOrEmpty(assemblyLocation))
            {
                return true;
            }

            string currentFolder = Path.GetDirectoryName(assemblyLocation);
            string targetsFileName = "durablefunctionsmonitor.dotnetbackend.targets";

            // Using our .targets file as a marker. It should only appear in our own output folder
            return File.Exists(Path.Combine(currentFolder, targetsFileName)) || 
                File.Exists(Path.Combine(Path.GetDirectoryName(currentFolder), targetsFileName));
        }

        private static string GetVersion()
        {
            var version = typeof(DfmEndpoint).Assembly.GetName().Version;
            return $"{version.Major}.{version.Minor}.{version.Build}";
        }
    }
}