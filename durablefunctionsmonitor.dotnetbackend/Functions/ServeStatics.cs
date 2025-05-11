// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using System.IO;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.AspNetCore.Http;
using System.Linq;
using System.Threading.Tasks;
using System;
using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;

namespace DurableFunctionsMonitor.DotNetBackend
{
    public static class ServeStatics
    {
        private const string StaticsRoute = "{p1?}/{p2?}/{p3?}";

        // A simple statics hosting solution
        [FunctionName(nameof(DfmServeStaticsFunction))]
        public static async Task<IActionResult> DfmServeStaticsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = StaticsRoute)] HttpRequest req,
            string p1,
            string p2,
            string p3,
            ExecutionContext context,
            ILogger log
        )
        {
            return await req.HandleErrors(log, async () => {

                // Checking nonce, if it was set as an env variable.
                // Don't care about return value of this method here.
                Auth.IsNonceSetAndValid(req.Headers);

                // Two bugs away. Making sure none of these segments ever contain any path separators and/or relative paths
                string path = Path.Join(Path.GetFileName(p1), Path.GetFileName(p2), Path.GetFileName(p3));

                string root = Path.Join(context.FunctionAppDirectory, "DfmStatics");

                var contentType = FileMap.FirstOrDefault(kv => path.StartsWith(kv[0]));
                if (contentType != null)
                {
                    string fullPath = Path.Join(root, path);

                    if (!File.Exists(fullPath))
                    {
                        return new NotFoundResult();
                    }

                    return new FileStreamResult(File.OpenRead(fullPath), contentType[1])
                    {
                        LastModified = File.GetLastWriteTimeUtc(fullPath)
                    };
                }

                // Adding anti-forgery token
                using(var generator = RandomNumberGenerator.Create())
                {
                    var bytes = new byte[64];
                    generator.GetBytes(bytes);
                    string token = Convert.ToBase64String(bytes);

                    req.HttpContext.Response.Cookies
                        .Append(Globals.XsrfTokenCookieAndHeaderName, token, new CookieOptions { HttpOnly = false });
                }

                // Returning index.html by default, to support client routing
                return await ReturnIndexHtml(context, log, root, p1, req.Path);
            });
        }

        private const string DefaultContentSecurityPolicyMeta =
            "<meta http-equiv=\"Content-Security-Policy " +
                "content=\"base-uri 'self'; " +
                "block-all-mixed-content; " +
                "default-src 'self'; " +
                "img-src data: 'self' vscode-resource:; " +
                "object-src 'none'; " +
                "script-src 'self' 'unsafe-inline' vscode-resource:; " +
                "connect-src 'self' https://login.microsoftonline.com; " +
                "frame-src 'self' https://login.microsoftonline.com; " +
                "style-src 'self' 'unsafe-inline'  vscode-resource: https://fonts.googleapis.com; " +
                "font-src 'self' 'unsafe-inline' https://fonts.gstatic.com; " +
                "upgrade-insecure-requests;\" " +
            ">";

        private static readonly string[][] FileMap = new string[][]
        {
            new [] {Path.Join("static", "css"), "text/css; charset=utf-8"},
            new [] {Path.Join("static", "js"), "application/javascript; charset=UTF-8"},
            new [] {"manifest.json", "application/json; charset=UTF-8"},
            new [] {"favicon.png", "image/png"},
            new [] {"logo.svg", "image/svg+xml; charset=UTF-8"},
        };

        // Populates index.html template and serves it
        private static async Task<ContentResult> ReturnIndexHtml(ExecutionContext context, ILogger log, string rootFolderName, string connAndHubName, string requestPath)
        {
            string indexHtmlPath = Path.Join(rootFolderName, "index.html");
            string html = await File.ReadAllTextAsync(indexHtmlPath);

            // Replacing our custom meta tag with customized code from Storage or with default Content Security Policy
            string customMetaTagCode = (await CustomTemplates.GetCustomMetaTagCodeAsync()) ?? DefaultContentSecurityPolicyMeta;
            html = html.Replace("<meta name=\"durable-functions-monitor-meta\">", customMetaTagCode);

            // Applying client config, if any
            string clientConfigString = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_CLIENT_CONFIG);
            if (!string.IsNullOrEmpty(clientConfigString))
            {
                dynamic clientConfig = JObject.Parse(clientConfigString);
                html = html.Replace("<script>var DfmClientConfig={}</script>", "<script>var DfmClientConfig=" + clientConfig.ToString() + "</script>");
            }

            string routePrefix = requestPath;

            // Mentioning whether Function Map is available for this Task Hub.
            if (!string.IsNullOrEmpty(connAndHubName))
            {
                // Two bugs away. Validating that the incoming Task Hub name looks like a Task Hub name
                Auth.ThrowIfTaskHubNameHasInvalidSymbols(connAndHubName);

                Globals.SplitConnNameAndHubName(connAndHubName, out var connName, out var hubName);

                string functionMap = (await CustomTemplates.GetFunctionMapsAsync()).GetFunctionMap(hubName);
                if (!string.IsNullOrEmpty(functionMap))
                {
                    html = html.Replace("<script>var IsFunctionGraphAvailable=0</script>", "<script>var IsFunctionGraphAvailable=1</script>");
                }

                /*  Using connAndHubName as an anchor, to locate the path prefix (path _without_ connAndHubName)
                    Paths that need to be correctly handled here are:
                        /my-hub-name
                        /my-hub-name/orchestrations/my-instance-id
                        /my/path/my-hub-name
                        /my/path/my-hub-name/orchestrations/my-instance-id
                */

                // First trying with both slashes (to prevent collisions with instanceIds)
                int pos = requestPath.IndexOf("/" + connAndHubName + "/");
                if (pos >= 0)
                {
                    // Checking that TaskHub name does not collide with the prefix
                    int nextPos = requestPath.IndexOf("/" + connAndHubName, pos + 1);
                    if (nextPos >= 0)
                    {
                        // Preferring the last one
                        pos = nextPos;
                    }
                }
                else
                {
                    // Now just with the left slash
                    pos = requestPath.IndexOf("/" + connAndHubName);
                }

                if (pos >= 0)
                {
                    routePrefix = requestPath.Substring(0, pos);
                }
            }
            // Two bugs away. Checking that route prefix does not look malicious.
            Auth.ThrowIfPathHasInvalidSymbols(routePrefix);

            routePrefix = routePrefix?.Trim('/');

            // Prepending ingress route prefix, if configured
            string ingressRoutePrefix = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_INGRESS_ROUTE_PREFIX);
            if (!string.IsNullOrEmpty(ingressRoutePrefix))
            {
                routePrefix = (ingressRoutePrefix + "/" + routePrefix ?? string.Empty).Trim('/');
            }

            log.LogInformation($"DFM endpoint: /{routePrefix}");

            if (!string.IsNullOrEmpty(routePrefix))
            {
                html = html.Replace("<script>var DfmRoutePrefix=\"\"</script>", $"<script>var DfmRoutePrefix=\"{routePrefix}\"</script>");
                html = html.Replace("href=\"/", $"href=\"/{routePrefix}/");
                html = html.Replace("src=\"/", $"src=\"/{routePrefix}/");
            }

            return new ContentResult()
            {
                Content = html,
                ContentType = "text/html; charset=UTF-8"
            };
        }
    }
}
