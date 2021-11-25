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

                var contentType = FileMap.FirstOrDefault((kv => path.StartsWith(kv[0])));
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
                return await ReturnIndexHtml(context, log, root, p1);
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

        private static string RoutePrefix = null;
        // Gets routePrefix setting from host.json (since there seems to be no other place to take it from)
        private static string GetRoutePrefixFromHostJson(ExecutionContext context, ILogger log)
        {
            if (RoutePrefix != null)
            {
                return RoutePrefix;
            }

            try
            {
                string hostJsonFileName = Path.Combine(context.FunctionAppDirectory, "host.json");
                dynamic hostJson = JObject.Parse(File.ReadAllText(hostJsonFileName));

                RoutePrefix = hostJson.extensions.http.routePrefix;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Failed to get RoutePrefix from host.json, using default value ('api')");
                RoutePrefix = "api";
            }
            return RoutePrefix;
        }

        private static string DfmRoutePrefix = null;
        // Gets DfmRoutePrefix from our function.json file, but only if that file wasn't modified by our build task.
        private static string GetDfmRoutePrefixFromFunctionJson(ExecutionContext context, ILogger log)
        {
            if (DfmRoutePrefix != null)
            {
                return DfmRoutePrefix;
            }

            DfmRoutePrefix = string.Empty;
            try
            {
                string functionJsonFileName = Path.Combine(context.FunctionAppDirectory, nameof(DfmServeStaticsFunction), "function.json");
                dynamic functionJson = JObject.Parse(File.ReadAllText(functionJsonFileName));

                string route = functionJson.bindings[0].route;

                // if it wasn't modified by our build task, then doing nothing
                if(route != StaticsRoute)
                {
                    DfmRoutePrefix = route.Substring(0, route.IndexOf("/" + StaticsRoute));
                }
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Failed to get DfmRoutePrefix from function.json, using default value (empty string)");
            }
            return DfmRoutePrefix;
        }

        // Populates index.html template and serves it
        private static async Task<ContentResult> ReturnIndexHtml(ExecutionContext context, ILogger log, string root, string connAndHubName)
        {
            string indexHtmlPath = Path.Join(root, "index.html");
            string html = await File.ReadAllTextAsync(indexHtmlPath);

            // Replacing our custom meta tag with customized code from Storage or with default Content Security Policy
            string customMetaTagCode = (await CustomTemplates.GetCustomMetaTagCodeAsync()) ?? DefaultContentSecurityPolicyMeta;
            html = html.Replace("<meta name=\"durable-functions-monitor-meta\">", customMetaTagCode);

            // Calculating routePrefix
            string routePrefix = GetRoutePrefixFromHostJson(context, log);
            string dfmRoutePrefix = GetDfmRoutePrefixFromFunctionJson(context, log);
            if (!string.IsNullOrEmpty(dfmRoutePrefix))
            {
                routePrefix = string.IsNullOrEmpty(routePrefix) ? dfmRoutePrefix : routePrefix + "/" + dfmRoutePrefix;
            }

            // Applying routePrefix, if it is set to something other than empty string
            if (!string.IsNullOrEmpty(routePrefix))
            {
                html = html.Replace("<script>var DfmRoutePrefix=\"\"</script>", $"<script>var DfmRoutePrefix=\"{routePrefix}\"</script>");
                html = html.Replace("href=\"/", $"href=\"/{routePrefix}/");
                html = html.Replace("src=\"/", $"src=\"/{routePrefix}/");
            }

            // Applying client config, if any
            string clientConfigString = Environment.GetEnvironmentVariable(EnvVariableNames.DFM_CLIENT_CONFIG);
            if (!string.IsNullOrEmpty(clientConfigString))
            {
                dynamic clientConfig = JObject.Parse(clientConfigString);
                html = html.Replace("<script>var DfmClientConfig={}</script>", "<script>var DfmClientConfig=" + clientConfig.ToString() + "</script>");
            }

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
            }

            return new ContentResult()
            {
                Content = html,
                ContentType = "text/html; charset=UTF-8"
            };
        }
    }
}
