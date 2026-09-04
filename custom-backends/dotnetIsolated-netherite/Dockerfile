# NOTE: this Dockerfile expects the REPO ROOT as its build context, because the project
# references durablefunctionsmonitor.dotnetisolated.core (and friends) by project reference:
#
#   docker build -f custom-backends/dotnetIsolated-netherite/Dockerfile .

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS installer-env

COPY . /src
RUN cd /src && \
    mkdir -p /home/site/wwwroot && \
    dotnet publish custom-backends/dotnetIsolated-netherite/Dfm.DotNetIsolatedNetherite.csproj --output /home/site/wwwroot

FROM mcr.microsoft.com/azure-functions/dotnet-isolated:4-dotnet-isolated8.0
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

COPY --from=installer-env ["/home/site/wwwroot", "/home/site/wwwroot"]
