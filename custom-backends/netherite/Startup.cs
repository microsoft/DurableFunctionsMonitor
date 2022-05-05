using DurableFunctionsMonitor.DotNetBackend;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Hosting;

[assembly: WebJobsStartup(typeof(Dfm.Netherite.Startup))]
namespace Dfm.Netherite
{
    public class Startup : IWebJobsStartup
    {
        public void Configure(IWebJobsBuilder builder)
        {
            DfmEndpoint.Setup();
        }
    }
}
