// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

namespace DurableFunctionsMonitor.DotNetIsolated
{
    [AttributeUsage(AttributeTargets.Method)]
    internal class OperationKindAttribute : Attribute
    {
        public OperationKind Kind { get; set; }
    }
}