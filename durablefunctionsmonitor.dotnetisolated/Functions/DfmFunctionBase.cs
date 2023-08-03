// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Base class for all DfMon's Functions. Checks that DfMon was properly initialized.
    /// </summary>
    public class DfmFunctionBase
    {
        protected DfmSettings Settings { get; private set; }
        protected DfmExtensionPoints ExtensionPoints { get; private set; }

        public DfmFunctionBase(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints)
        {
            // Checking that UseDurableFunctionMonitor() was called
            ArgumentNullException.ThrowIfNull(dfmSettings);
            this.Settings = dfmSettings;

            ArgumentNullException.ThrowIfNull(extensionPoints);
            this.ExtensionPoints = extensionPoints;
        }
    }
}