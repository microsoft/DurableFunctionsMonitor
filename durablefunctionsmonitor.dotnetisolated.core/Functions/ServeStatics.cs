// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Newtonsoft.Json.Linq;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using System.Net;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    public class ServeStatics : DfmFunctionBase
    {
        public ServeStatics(DfmSettings dfmSettings, DfmExtensionPoints extensionPoints, ILoggerFactory loggerFactory) : base(dfmSettings, extensionPoints) 
        { 
            this._logger = loggerFactory.CreateLogger<ServeStatics>();
        }

        // A simple statics hosting solution
        [Function(nameof(DfmServeStaticsFunction))]
        public async Task<HttpResponseData> DfmServeStaticsFunction(
            [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = Globals.DfMonRoutePrefix + "/{p1?}/{p2?}/{p3?}")] HttpRequestData req,
            string p1,
            string p2,
            string p3
        )
        {
            // Checking nonce, if it was set as an env variable.
            // Don't care about return value of this method here.
            Auth.IsNonceSetAndValid(this.Settings, req.Headers);

            // Two bugs away. Making sure none of these segments ever contain any path separators and/or relative paths
            string path = Path.Join(Path.GetFileName(p1), Path.GetFileName(p2), Path.GetFileName(p3));

            string root = Path.Join(Environment.CurrentDirectory, "DfmStatics");

            var contentType = FileMap.FirstOrDefault((kv => path.StartsWith(kv[0])));
            if (contentType != null)
            {
                string fullPath = Path.Join(root, path);

                if (!File.Exists(fullPath))
                {
                    return req.CreateResponse(HttpStatusCode.NotFound);
                }

                var fileResponse = req.CreateResponse(HttpStatusCode.OK);

                fileResponse.Headers.Add("Content-Type", contentType[1]);
                fileResponse.Headers.Add("Last-Modified", File.GetLastWriteTimeUtc(fullPath).ToString("R"));

                fileResponse.Body = File.OpenRead(fullPath);

                return fileResponse;
            }

            // Returning index.html by default, to support client routing
            var htmlResponse = req.CreateResponse(HttpStatusCode.OK);

            // Adding anti-forgery token
            using(var generator = RandomNumberGenerator.Create())
            {
                var bytes = new byte[64];
                generator.GetBytes(bytes);
                string token = Convert.ToBase64String(bytes);

                htmlResponse.Cookies.Append(Globals.XsrfTokenCookieAndHeaderName, token);
            }

            htmlResponse.Headers.Add("Content-Type", "text/html; charset=UTF-8");

            await htmlResponse.WriteStringAsync(await ReturnIndexHtml(this._logger, root, p1, req.Url.AbsolutePath));

            return htmlResponse;
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

        private readonly ILogger _logger;

        // Populates index.html template and serves it
        private async Task<string> ReturnIndexHtml(ILogger log, string rootFolderName, string connAndHubName, string requestPath)
        {
            string indexHtmlPath = Path.Join(rootFolderName, "index.html");
            string html = await File.ReadAllTextAsync(indexHtmlPath);

            // Replacing our custom meta tag with customized code from Storage or with default Content Security Policy
            string customMetaTagCode = (await CustomTemplates.GetCustomMetaTagCodeAsync(this.Settings)) ?? DefaultContentSecurityPolicyMeta;
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

                string functionMap = (await CustomTemplates.GetFunctionMapsAsync(this.Settings)).GetFunctionMap(hubName);
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

            routePrefix = routePrefix?.Trim('/');

            // Prepending ingress route prefix, if configured
            string ingressRoutePrefix = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_INGRESS_ROUTE_PREFIX);
            routePrefix = $"{ingressRoutePrefix}/{routePrefix}".Trim('/');

            log.LogInformation($"DFM endpoint: /{routePrefix}");

            if (!string.IsNullOrEmpty(routePrefix))
            {
                html = html.Replace("<script>var DfmRoutePrefix=\"\"</script>", $"<script>var DfmRoutePrefix=\"{routePrefix}\"</script>");
                html = html.Replace("href=\"/", $"href=\"/{routePrefix}/");
                html = html.Replace("src=\"/", $"src=\"/{routePrefix}/");
            }

            // The API endpoint path is now locked, so we need to pass it explicitly, as a separate parameter.
            string apiRoutePrefix = $"{ingressRoutePrefix}{GetHttpRoutePrefix()}/{Globals.DfMonRoutePrefix}/a/p/i".Trim('/');

            html = html.Replace("<script>var DfmApiRoutePrefix=\"\"</script>", $"<script>var DfmApiRoutePrefix=\"{apiRoutePrefix}\"</script>");

            return html;
        }

        private static string GetHttpRoutePrefix()
        {
            try
            {
                // First trying config setting
                string result = Environment.GetEnvironmentVariable("AzureFunctionsJobHost__extensions__http__routePrefix");

                if (result == null)
                {
                    // Now reading host.json
                    string hostJsonFileName = Globals.GetHostJsonPath();
                    dynamic hostJson = JObject.Parse(File.ReadAllText(hostJsonFileName));

                    result = hostJson.extensions.http.routePrefix;
                }

                result = result.Trim(' ', '/');

                if (result != string.Empty)
                {
                    result = $"/{result}";
                }

                return result;
            }
            catch (Exception)
            {
                return "/api";
            }
        }
    }
}
