// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Marks Function as DfMon's Function and specifies OperationKind (read or write) for it
    /// </summary>
    [AttributeUsage(AttributeTargets.Method)]
    internal class OperationKindAttribute : Attribute
    {
        public OperationKind Kind { get; set; }
    }
}