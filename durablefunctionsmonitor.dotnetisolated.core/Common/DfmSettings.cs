// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

namespace DurableFunctionsMonitor.DotNetIsolated
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

        /// <summary>
        /// Custom prefix for 'User-Agent' header for requests to Azure Storage.
        /// When specified, the final 'User-Agent' header will look like this: 
        /// "CustomUserAgentPrefix/{DfMon's Version}"
        /// </summary>
        public string CustomUserAgentPrefix { get; set; }

        /// <summary>
        /// Initializes settings with default values
        /// </summary>
        public DfmSettings()
        {
            this.UserNameClaimName = Auth.PreferredUserNameClaim;
            this.RolesClaimName = Auth.RolesClaim;

            string dfmNonce = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_NONCE);

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

            this.DisableAuthentication = dfmNonce == Auth.ISureKnowWhatIAmDoingNonce;
            this.Mode = dfmMode == DfmMode.ReadOnly.ToString() ? DfmMode.ReadOnly : DfmMode.Normal;
            this.AllowedUserNames = dfmAllowedUserNames == null ? null : dfmAllowedUserNames.Split(',');
            this.AllowedAppRoles = allowedAppRoles;
            this.AllowedReadOnlyAppRoles = allowedReadOnlyAppRoles;
            this.UserNameClaimName = string.IsNullOrEmpty(dfmUserNameClaimName) ? Auth.PreferredUserNameClaim : dfmUserNameClaimName;
            this.RolesClaimName = string.IsNullOrEmpty(dfmRolesClaimName) ? Auth.RolesClaim : dfmRolesClaimName;
        }
    }
}