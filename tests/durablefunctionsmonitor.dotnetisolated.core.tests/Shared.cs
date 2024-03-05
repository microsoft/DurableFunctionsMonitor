// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Azure.Functions.Worker;
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Security.Claims;
using Microsoft.DurableTask.Client;
using System.Threading.Tasks;
using System.Threading;

namespace durablefunctionsmonitor.dotnetbackend.tests
{
    public static class Shared
    {
        public static readonly string Nonce = new Random().Next().ToString();

        public static void CopyFolder(string source, string dest)
        {
            var folder = new DirectoryInfo(source);
            Directory.CreateDirectory(dest);

            foreach (FileInfo file in folder.GetFiles())
            {
                string targetFilePath = Path.Combine(dest, file.Name);
                file.CopyTo(targetFilePath, true);
            }

            foreach (var subDir in folder.GetDirectories())
            {
                CopyFolder(subDir.FullName, Path.Combine(dest, subDir.Name));
            }
        }
    }

    class FakeHttpCookies : HttpCookies
    {
        public override void Append(string name, string value)
        {
        }

        public override void Append(IHttpCookie cookie)
        {
        }

        public override IHttpCookie CreateNew()
        {
            return new HttpCookie("FakeCookie", "FakeCookieValue");
        }
    }

    class FakeHttpResponseData : HttpResponseData
    {
        public FakeHttpResponseData(FunctionContext functionContext) : base(functionContext)
        {
            this.Headers = new HttpHeadersCollection();
            this.Cookies = new FakeHttpCookies();
            this.Body = new MemoryStream();
        }

        public override HttpStatusCode StatusCode { get; set; }
        public override HttpHeadersCollection Headers { get; set; }
        public override Stream Body { get; set; }

        public override HttpCookies Cookies { get; }
    }

    class FakeHttpRequestData : HttpRequestData
    {
        private List<HttpCookie> _cookies = new List<HttpCookie>();
        private List<ClaimsIdentity> _identities = new List<ClaimsIdentity>();

        public FakeHttpRequestData(Uri uri) : base(new FakeFunctionContext())
        {
            this.Headers = new HttpHeadersCollection();
            this.Url = uri;
        }

        public override Stream Body => throw new NotImplementedException();

        public override HttpHeadersCollection Headers { get; }

        public override IReadOnlyCollection<IHttpCookie> Cookies => this._cookies;

        public override Uri Url { get; }

        public override IEnumerable<ClaimsIdentity> Identities => this._identities;

        public override string Method { get; }

        public override HttpResponseData CreateResponse()
        {
            return new FakeHttpResponseData(this.FunctionContext);
        }

        public void AddCookie(string name, string val)
        {
            this._cookies.Add(new HttpCookie(name, val));
        }

        public void AddIdentity(ClaimsIdentity identity)
        {
            this._identities.Add(identity);
        }
    }

    class FakeFunctionContext : FunctionContext
    {
        public override FunctionDefinition FunctionDefinition => throw new NotImplementedException();

        public override IServiceProvider InstanceServices { get => throw new NotImplementedException(); set => throw new NotImplementedException(); }

        public override string InvocationId => throw new NotImplementedException();

        public override string FunctionId => throw new NotImplementedException();

        public override TraceContext TraceContext => throw new NotImplementedException();

        public override BindingContext BindingContext => throw new NotImplementedException();

        public override RetryContext RetryContext => throw new NotImplementedException();

        public override IDictionary<object, object> Items { get; set; } = new Dictionary<object, object>();

        public override IInvocationFeatures Features => throw new NotImplementedException();
    }

    class FakeDurableTaskClient : DurableTaskClient
    {
        public FakeDurableTaskClient() : base("FakeDurableTaskClient")
        {
        }

        public override ValueTask DisposeAsync()
        {
            throw new NotImplementedException();
        }

        public override Microsoft.DurableTask.AsyncPageable<OrchestrationMetadata> GetAllInstancesAsync(OrchestrationQuery filter = null)
        {
            return Microsoft.DurableTask.Pageable.Create(async (s, t) => new Microsoft.DurableTask.Page<OrchestrationMetadata>(new OrchestrationMetadata[0]));
        }

        public override Task<OrchestrationMetadata> GetInstancesAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task<PurgeResult> PurgeAllInstancesAsync(PurgeInstancesFilter filter, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task<PurgeResult> PurgeInstanceAsync(string instanceId, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task RaiseEventAsync(string instanceId, string eventName, object eventPayload = null, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task ResumeInstanceAsync(string instanceId, string reason = null, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task<string> ScheduleNewOrchestrationInstanceAsync(Microsoft.DurableTask.TaskName orchestratorName, object input = null, Microsoft.DurableTask.StartOrchestrationOptions options = null, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task SuspendInstanceAsync(string instanceId, string reason = null, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task TerminateInstanceAsync(string instanceId, object output = null, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task<OrchestrationMetadata> WaitForInstanceCompletionAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }

        public override Task<OrchestrationMetadata> WaitForInstanceStartAsync(string instanceId, bool getInputsAndOutputs = false, CancellationToken cancellation = default)
        {
            throw new NotImplementedException();
        }
    }
}
