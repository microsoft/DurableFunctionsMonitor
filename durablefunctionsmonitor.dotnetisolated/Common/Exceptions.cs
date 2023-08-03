// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

namespace DurableFunctionsMonitor.DotNetIsolated
{
    internal class DfmUnauthorizedException: Exception
    {
        public DfmUnauthorizedException(string msg) : base(msg) {}
    }

    internal class DfmAccessViolationException: Exception
    {
        public DfmAccessViolationException(string msg) : base(msg) {}
    }

    internal class DfmNotInitializedException: Exception
    {
        public DfmNotInitializedException() : base("Make sure you called UseDurableFunctionsMonitor() at your Function's startup") {}
    }
}