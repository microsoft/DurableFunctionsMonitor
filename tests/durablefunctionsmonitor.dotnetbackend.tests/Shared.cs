using System;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    public static class Shared
    {
        public static readonly string Nonce = new Random().Next().ToString();
    }
}
