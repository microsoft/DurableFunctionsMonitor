# .NET 10 + Multi-Arch Docker Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every .NET Isolated DfMon project to net10.0, add DfMon spans (ActivitySource), make it deployable to Azure Container Apps, publish `scaletone/durablefunctionsmonitor` and `scaletone/durablefunctionsmonitor.mssql` as linux/amd64 + linux/arm64 images, and export logs/traces/metrics over OTLP with OpenTelemetry 1.19.x.

**Architecture:** One shared multi-stage `docker/Dockerfile` (repo-root build context) builds the Azure Functions host from source for the target arch (the official `mcr.microsoft.com/azure-functions/*` images are amd64-only) and publishes the chosen DfMon isolated project on top of `mcr.microsoft.com/dotnet/aspnet:10.0`. Both build stages run on `$BUILDPLATFORM` and cross-compile, so no QEMU is needed. `docker/smoke-test.sh` is the executable acceptance test per image/arch. CI runs it on native amd64 and arm64 GitHub runners before any push.

**Tech Stack:** .NET 10 SDK, Azure Functions host v4.1054.200 (built from source), Functions .NET Isolated worker 2.51.0, Docker Buildx, GitHub Actions (`ubuntu-24.04` + `ubuntu-24.04-arm`), Azurite, Azure SQL Edge, OpenTelemetry .NET 1.19.x, OTel Collector (debug exporter) for verification.

**Spec:** No separate spec document. This plan records the decisions agreed in the planning conversation (see "Decisions" below). Executors treat that section as the spec.

## Decisions (the spec)

1. **In-process stays as is.** `durablefunctionsmonitor.dotnetbackend`, `custom-backends/{mssql,netherite,netcore21,netcore31}`, the VS Code extension's backend and `tests/durablefunctionsmonitor.dotnetbackend.tests` are **not modified** (the in-process model cannot run on .NET 10). The only change is that the Docker images stop being built from them.
2. **Main image goes isolated.** `scaletone/durablefunctionsmonitor` is now built from `durablefunctionsmonitor.dotnetisolated`, and `scaletone/durablefunctionsmonitor.mssql` from `custom-backends/dotnetIsolated-mssql`.
3. **Netherite image is dropped.** Existing tags remain on Docker Hub, no new tags are published, and the README says so.
4. **One custom Dockerfile for both arches**, with the Functions host built from source at a pinned `HOST_VERSION`.
5. **net10 everywhere on the isolated side**, including the NuGet packages and the ARM templates (`netFrameworkVersion` `v10.0`). This is a **breaking change** for existing Azure deployments on the .NET 8 site config. It is documented in the READMEs, and the maintainer decides the version number.
6. **OpenTelemetry** for logs, traces and metrics, latest stable. The request said "1.9.x". The current stable line is **1.19.x** (1.19.1 core/exporter/hosting, 1.19.0 instrumentation) and this plan uses it. Ruled: 1.19.x.

## Findings from planning spikes (already verified; don't re-derive)

- Isolated exes publish on net10.0 with the current package versions. Only the `custom-backends/dotnetIsolated` sample fails, because its Worker.Sdk 1.17.2 rejects net10 with "Invalid combination of TargetFramework and AzureFunctionsVersion".
- `tests/durablefunctionsmonitor.dotnetisolated.core.tests` on net10.0 has **6 failures**, all in `AuthTests` `DataRow`s that pass `""`. Since .NET 9, `Environment.SetEnvironmentVariable(name, "")` stores an empty value instead of deleting the variable, so `"".Split(',')` yields `[""]` in all three role lists and `DfmSettings` throws "should not intersect". Fix: pass `null` in those DataRows (the original meaning was "unset"). **Do not** change `DfmSettings` to treat empty as unset: that would turn `DFM_ALLOWED_USER_NAMES=""` from "nobody" into "no restriction".
- Building the host with ReadyToRun fails for linux-arm64: `NU1301` 401 on `Microsoft.NETCore.App.Crossgen2.linux-arm64` from the host repo's private azfunc feed. With `-p:PublishReadyToRun=false` it builds.
- The arm64 host plus the net10 DfMon app ran natively on arm64 (`uname -m` → `aarch64`). `GET /` with the nonce header returned the SPA, and `task-hub-names` returned `200 []` against Azurite.
- mssql on arm64 against Azure SQL Edge: the host starts. Because DfMon has no orchestrators, the SQL provider never creates `DurableDB`, so `task-hub-names` answers `Cannot open database "DurableDB" requested by the login`. That is the deterministic "SqlClient reached SQL" signal. Pointing at `Database=master` stops the host from starting (503).
- OTel wiring (below) compiles against Worker 2.51.0 with `Microsoft.Azure.Functions.Worker.OpenTelemetry` 1.2.0.
- A host image build needs about 3 GB of free Docker disk. Run `docker builder prune -af` if a build fails with `No space left on device`.

## Global Constraints

- TargetFramework `net10.0` for: `durablefunctionsmonitor.dotnetisolated.core`, `durablefunctionsmonitor.dotnetisolated`, `durablefunctionsmonitor.dotnetisolated.mssql`, `custom-backends/dotnetIsolated-mssql`, `custom-backends/dotnetIsolated`, `tests/durablefunctionsmonitor.dotnetisolated.core.tests`.
- In-process projects are untouched: `net6.0` backends and the `net8.0` `dotnetbackend.tests`.
- Functions host: `HOST_VERSION=4.1054.200`, built with `-p:PublishReadyToRun=false --self-contained`.
- Runtime base image: `mcr.microsoft.com/dotnet/aspnet:10.0`. SDK image: `mcr.microsoft.com/dotnet/sdk:10.0`.
- Image platforms: `linux/amd64,linux/arm64`. Images: `scaletone/durablefunctionsmonitor`, `scaletone/durablefunctionsmonitor.mssql`. No netherite image.
- Containers listen on **port 80** (`ASPNETCORE_URLS=http://+:80`). The README `docker run -p 7072:80` instructions and `dfm-aks-deployment.yaml` rely on it.
- OpenTelemetry: `OpenTelemetry.Exporter.OpenTelemetryProtocol` 1.19.1, `OpenTelemetry.Extensions.Hosting` 1.19.1, `OpenTelemetry.Instrumentation.Http` 1.19.0, `OpenTelemetry.Instrumentation.Runtime` 1.19.0, `Microsoft.Azure.Functions.Worker.OpenTelemetry` 1.2.0. Export is enabled **only** when `OTEL_EXPORTER_OTLP_ENDPOINT` is non-empty.
- OTel is wired in the two standalone exes only, never in `durablefunctionsmonitor.dotnetisolated.core` (NuGet library consumers must not inherit it).
- Every GitHub Action is pinned to a full commit SHA with a `# vX.Y.Z` comment (repo policy, commit 9da03e4).
- ARM templates: `"netFrameworkVersion": "v10.0"`.
- Do not bump `AssemblyVersion`/`FileVersion`/nuspec `<version>`. Releases are versioned separately (see "version 6.8.1" commits).

## Review Focus

1. **Existing Azure deployments break on the next NuGet release.** They run from the unversioned NuGet URL on a `v8.0` site config. No test can cover this; the READMEs must state the breaking change and the one-line fix (set the site's .NET version to 10) (Task 2).
2. **No OTLP endpoint configured** (the default for every current user): the app must behave exactly as before, with no exporter and no retries against `localhost:4317`. This is pinned by the default smoke run (no `OTEL_*` env) passing in Task 5, and by the `IsNullOrEmpty` guard.
3. **arm64 image secretly containing amd64 binaries** (a wrong RID in the host stage). Pinned by the smoke test's `uname -m` check. In CI it runs on a native arm64 runner with no emulation, so an amd64 host binary can't execute at all (Task 3/7).
4. **SQL not ready when DfMon starts.** The Durable SQL provider fails host start if SQL is unreachable. The smoke test waits for "SQL Server is now ready for client connections" before starting the app (Task 3).
5. **Stripped language workers** (`workers/*` removed from the host to save about 500 MB) break host start for dotnet-isolated. Pinned by the smoke test's `GET /` → 200 on both arches (Task 4).

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `durablefunctionsmonitor.dotnetisolated.core/*.csproj` | Modify | TFM → net10.0 |
| `durablefunctionsmonitor.dotnetisolated.mssql/*.csproj` | Modify | TFM → net10.0 |
| `durablefunctionsmonitor.dotnetisolated/*.csproj` | Modify | TFM → net10.0; OTel packages |
| `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj` | Modify | TFM → net10.0; OTel packages; link `OpenTelemetrySetup.cs` |
| `custom-backends/dotnetIsolated/Dfm.DotNetIsolated.csproj` | Modify | TFM → net10.0; Worker package bump |
| `tests/durablefunctionsmonitor.dotnetisolated.core.tests/*.csproj` | Modify | TFM → net10.0 |
| `tests/durablefunctionsmonitor.dotnetisolated.core.tests/AuthTests.cs:271-273,310-312` | Modify | `""` → `null` in DataRows |
| `durablefunctionsmonitor.dotnetisolated/arm-template.json:101`, `custom-backends/dotnetIsolated-mssql/arm-template.json:107` | Modify | `v8.0` → `v10.0` |
| `docker/Dockerfile` | Create | Shared multi-arch image build |
| `.dockerignore` | Create | Trims the repo-root build context |
| `docker/smoke-test.sh` | Create | Acceptance test: one image × one platform × one backend |
| `docker/otel-collector-smoke.yaml` | Create | Collector config used by the smoke test's OTel check |
| `durablefunctionsmonitor.dotnetisolated/OpenTelemetrySetup.cs` | Create | `ConfigureDfmOpenTelemetry()` host extension, shared by both exes |
| `durablefunctionsmonitor.dotnetisolated/Program.cs`, `custom-backends/dotnetIsolated-mssql/Program.cs` | Modify | Call `ConfigureDfmOpenTelemetry()` |
| `durablefunctionsmonitor.dotnetisolated/host.json`, `custom-backends/dotnetIsolated-mssql/host.json` | Modify | `"telemetryMode": "OpenTelemetry"` |
| `.github/workflows/docker-smoke.yml` | Create | Reusable: build + smoke on native amd64/arm64 runners |
| `.github/workflows/main-build.yml` | Modify | .NET 8 + 10 SDKs; call `docker-smoke.yml` |
| `.github/workflows/push-to-docker-hub.yml` | Modify | React statics → smoke → multi-arch push; drop netherite |
| `.github/workflows/push-to-nuget.yml` | Modify | .NET 8 + 10 SDKs |
| `durablefunctionsmonitor.dotnetbackend/Dockerfile`, `durablefunctionsmonitor.dotnetbackend/.dockerignore`, `custom-backends/mssql/Dockerfile`, `custom-backends/netherite/Dockerfile` | Delete | Replaced by `docker/Dockerfile` |
| `durablefunctionsmonitor.dotnetisolated/README.md`, `custom-backends/dotnetIsolated-mssql/README.md`, `custom-backends/mssql/README.md`, `custom-backends/netherite/README.md` | Modify | Docker, OTel and breaking-change docs |

---

### Task 1: Retarget the .NET Isolated projects to net10.0

**Files:**
- Modify: `tests/durablefunctionsmonitor.dotnetisolated.core.tests/durablefunctionsmonitor.dotnetisolated.core.tests.csproj`
- Modify: `durablefunctionsmonitor.dotnetisolated.core/durablefunctionsmonitor.dotnetisolated.core.csproj`
- Modify: `tests/durablefunctionsmonitor.dotnetisolated.core.tests/AuthTests.cs:271-273,310-312`
- Modify: `durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj`
- Modify: `durablefunctionsmonitor.dotnetisolated.mssql/durablefunctionsmonitor.dotnetisolated.mssql.csproj`
- Modify: `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj`
- Modify: `custom-backends/dotnetIsolated/Dfm.DotNetIsolated.csproj`

**Interfaces:**
- Consumes: nothing.
- Produces: all isolated projects build and publish as net10.0. Publishing `durablefunctionsmonitor.dotnetisolated` or `custom-backends/dotnetIsolated-mssql` yields a `*.runtimeconfig.json` with `"tfm": "net10.0"`. Task 4's Dockerfile relies on this.

- [ ] **Step 1: Retarget the core library and its tests (the "test" is the existing suite under net10)**

In `durablefunctionsmonitor.dotnetisolated.core/durablefunctionsmonitor.dotnetisolated.core.csproj` and `tests/durablefunctionsmonitor.dotnetisolated.core.tests/durablefunctionsmonitor.dotnetisolated.core.tests.csproj`, replace:

```xml
    <TargetFramework>net8.0</TargetFramework>
```

with:

```xml
    <TargetFramework>net10.0</TargetFramework>
```

- [ ] **Step 2: Run the tests and confirm the known failures**

Run: `dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests`
Expected: `Failed: 6, Passed: 53`. All failures are in `ReturnsUnauthorizedResultIfUserIsNotInAppRole` / `ReturnsAuthorizedIfUserIsInAppRole` with `System.NotSupportedException: DFM_ALLOWED_APP_ROLES, DFM_ALLOWED_FULL_ACCESS_APP_ROLES and DFM_ALLOWED_READ_ONLY_APP_ROLES should not intersect`.

- [ ] **Step 3: Fix the DataRows to mean "unset"**

In `tests/durablefunctionsmonitor.dotnetisolated.core.tests/AuthTests.cs`, replace lines 271-273:

```csharp
        [DataRow("role1,role2", "", "", DisplayName = "DFM_ALLOWED_APP_ROLES")]
        [DataRow("", "role1,role2", "", DisplayName = "DFM_ALLOWED_FULL_ACCESS_APP_ROLES")]
        [DataRow("", "", "role1,role2", DisplayName = "DFM_ALLOWED_READ_ONLY_APP_ROLES")]
```

with:

```csharp
        [DataRow("role1,role2", null, null, DisplayName = "DFM_ALLOWED_APP_ROLES")]
        [DataRow(null, "role1,role2", null, DisplayName = "DFM_ALLOWED_FULL_ACCESS_APP_ROLES")]
        [DataRow(null, null, "role1,role2", DisplayName = "DFM_ALLOWED_READ_ONLY_APP_ROLES")]
```

and lines 310-312:

```csharp
        [DataRow("role1,role2", "", "", DfmMode.Normal, DisplayName = "DFM_ALLOWED_APP_ROLES")]
        [DataRow("", "role1,role2", "", DfmMode.Normal, DisplayName = "DFM_ALLOWED_FULL_ACCESS_APP_ROLES")]
        [DataRow("", "", "role1,role2", DfmMode.ReadOnly, DisplayName = "DFM_ALLOWED_READ_ONLY_APP_ROLES")]
```

with:

```csharp
        [DataRow("role1,role2", null, null, DfmMode.Normal, DisplayName = "DFM_ALLOWED_APP_ROLES")]
        [DataRow(null, "role1,role2", null, DfmMode.Normal, DisplayName = "DFM_ALLOWED_FULL_ACCESS_APP_ROLES")]
        [DataRow(null, null, "role1,role2", DfmMode.ReadOnly, DisplayName = "DFM_ALLOWED_READ_ONLY_APP_ROLES")]
```

Change nothing else in the test file, and nothing in `DfmSettings.cs` (see Findings).

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests`
Expected: `Passed! - Failed: 0, Passed: 59`

- [ ] **Step 5: Retarget the remaining isolated projects**

Replace `<TargetFramework>net8.0</TargetFramework>` with `<TargetFramework>net10.0</TargetFramework>` in:
- `durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj`
- `durablefunctionsmonitor.dotnetisolated.mssql/durablefunctionsmonitor.dotnetisolated.mssql.csproj`
- `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj`
- `custom-backends/dotnetIsolated/Dfm.DotNetIsolated.csproj`

In `custom-backends/dotnetIsolated/Dfm.DotNetIsolated.csproj`, also align the Worker packages with the main project (Worker.Sdk 1.17.2 rejects net10):

```xml
    <PackageReference Include="DurableFunctionsMonitor.DotNetIsolated" Version="6.7.3" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker" Version="2.51.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.DurableTask" Version="1.16.3" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Extensions.Http" Version="3.1.0" />
    <PackageReference Include="Microsoft.Azure.Functions.Worker.Sdk" Version="2.0.7" />
```

- [ ] **Step 6: Publish each exe and verify the runtime target**

Run:
```bash
S=$(mktemp -d)
for p in durablefunctionsmonitor.dotnetisolated custom-backends/dotnetIsolated-mssql custom-backends/dotnetIsolated; do
  dotnet publish $p -c Release -o $S/$(basename $p) >/dev/null && grep -h '"tfm"' $S/$(basename $p)/*.runtimeconfig.json
done
```
Expected: three lines, each `"tfm": "net10.0",`, and no build errors.

- [ ] **Step 7: Confirm the in-process side still builds and tests (needs the .NET 8 runtime installed)**

Run: `dotnet build durablefunctionsmonitor.dotnetbackend && dotnet test tests/durablefunctionsmonitor.dotnetbackend.tests`
Expected: `Build succeeded` and the test run passes. If the test run aborts with a missing `Microsoft.NETCore.App 8.0` framework, install the .NET 8 runtime (`brew install dotnet@8` or the dotnet-install script) and rerun. That abort is an environment issue, not a regression.

- [ ] **Step 8: Commit**

```bash
git add durablefunctionsmonitor.dotnetisolated.core durablefunctionsmonitor.dotnetisolated durablefunctionsmonitor.dotnetisolated.mssql custom-backends/dotnetIsolated-mssql custom-backends/dotnetIsolated tests/durablefunctionsmonitor.dotnetisolated.core.tests
git commit -m "Retarget .NET Isolated projects to net10.0

.NET 9+ keeps empty env var values instead of deleting them, so AuthTests
DataRows now pass null to mean 'unset'."
```

---

### Task 2: ARM templates and the breaking-change note

**Files:**
- Modify: `durablefunctionsmonitor.dotnetisolated/arm-template.json:101`
- Modify: `custom-backends/dotnetIsolated-mssql/arm-template.json:107`
- Modify: `durablefunctionsmonitor.dotnetisolated/README.md`
- Modify: `custom-backends/dotnetIsolated-mssql/README.md`

**Interfaces:**
- Consumes: Task 1 (packages are now net10).
- Produces: nothing code-level.

- [ ] **Step 1: Bump the site .NET version**

In both ARM templates, replace:

```json
		            "netFrameworkVersion": "v8.0",
```

with:

```json
		            "netFrameworkVersion": "v10.0",
```

- [ ] **Step 2: Validate the JSON**

Run: `for f in durablefunctionsmonitor.dotnetisolated/arm-template.json custom-backends/dotnetIsolated-mssql/arm-template.json; do python3 -m json.tool $f >/dev/null && echo "$f ok"; done`
Expected: two `ok` lines.

- [ ] **Step 3: Add the breaking-change note**

Insert this block directly under the first heading of **both** `durablefunctionsmonitor.dotnetisolated/README.md` and `custom-backends/dotnetIsolated-mssql/README.md`:

```markdown
> **Breaking change: .NET 10.** Starting with this release the package targets .NET 10. If you deployed DfMon from the NuGet package (e.g. via the *Deploy to Azure* button) on a Function App configured for .NET 8, set the app's .NET version to 10 (`az functionapp config set --net-framework-version v10.0 -g <resource-group> -n <app-name>`) before or right after upgrading, otherwise the app will fail to start.
```

- [ ] **Step 4: Commit**

```bash
git add durablefunctionsmonitor.dotnetisolated/arm-template.json custom-backends/dotnetIsolated-mssql/arm-template.json durablefunctionsmonitor.dotnetisolated/README.md custom-backends/dotnetIsolated-mssql/README.md
git commit -m "Deploy .NET Isolated DfMon on .NET 10 site config; document breaking change"
```

---

### Task 3: Smoke-test script (the failing acceptance test)

**Files:**
- Create: `docker/smoke-test.sh`
- Create: `docker/otel-collector-smoke.yaml`

**Interfaces:**
- Consumes: nothing.
- Produces: `docker/smoke-test.sh <image> <platform> <backend>`, where `platform` ∈ `linux/amd64|linux/arm64` and `backend` ∈ `storage|mssql`. It exits 0 and prints `SMOKE PASS: ...` on success, and exits non-zero with `SMOKE FAIL: <reason>` plus the app logs otherwise. Env knobs: `SMOKE_TIMEOUT` (seconds, default 180) and `SMOKE_OTEL=1`, which also asserts that logs, traces and metrics reach an OTel collector. Tasks 4, 5, 6 and 7 call it with exactly this signature.

- [ ] **Step 1: Write the collector config**

Create `docker/otel-collector-smoke.yaml`:

```yaml
# OTel Collector config used by smoke-test.sh (SMOKE_OTEL=1): receives OTLP, prints a summary per batch.
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
exporters:
  debug:
    verbosity: basic
service:
  pipelines:
    traces:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    logs:
      receivers: [otlp]
      exporters: [debug]
```

- [ ] **Step 2: Write the smoke test**

Create `docker/smoke-test.sh`:

```bash
#!/usr/bin/env bash
# Smoke-tests a DfMon Docker image on one platform against a throwaway backing store.
#
# Usage: docker/smoke-test.sh <image> <linux/amd64|linux/arm64> <storage|mssql>
#   SMOKE_TIMEOUT=<seconds>  how long to wait for the app to come up (default 180)
#   SMOKE_OTEL=1             also verify logs, traces and metrics are exported via OTLP
set -euo pipefail

IMAGE="$1"
PLATFORM="$2"
BACKEND="$3"
TIMEOUT="${SMOKE_TIMEOUT:-180}"
NONCE="i_sure_know_what_i_am_doing"
RUN_ID="dfm-smoke-$$"
NET="$RUN_ID-net"
SQL_PASSWORD="Smoke-Test-Pa55!"
AZURITE_KEY="Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw=="
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$PLATFORM" in
  linux/amd64) EXPECTED_MACHINE=x86_64 ;;
  linux/arm64) EXPECTED_MACHINE=aarch64 ;;
  *) echo "Unsupported platform: $PLATFORM" >&2; exit 2 ;;
esac

SMOKE_FAILED=0
cleanup() {
  if [ "$SMOKE_FAILED" = 1 ]; then
    echo "----- app logs -----" >&2
    docker logs "$RUN_ID-app" 2>&1 | tail -100 >&2 || true
  fi
  docker rm -f "$RUN_ID-app" "$RUN_ID-deps" "$RUN_ID-otel" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { SMOKE_FAILED=1; echo "SMOKE FAIL: $*" >&2; exit 1; }

# Polls "$@" until it succeeds or TIMEOUT elapses
wait_for() {
  local what="$1"; shift
  local deadline=$((SECONDS + TIMEOUT))
  until "$@" >/dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || fail "$what not ready within ${TIMEOUT}s"
    sleep 3
  done
}

docker network create "$NET" >/dev/null

APP_ENV=(-e "DFM_NONCE=$NONCE")
case "$BACKEND" in
  storage)
    docker run -d --name "$RUN_ID-deps" --network "$NET" mcr.microsoft.com/azure-storage/azurite \
      azurite --blobHost 0.0.0.0 --queueHost 0.0.0.0 --tableHost 0.0.0.0 --skipApiVersionCheck --loose >/dev/null
    APP_ENV+=(-e "AzureWebJobsStorage=DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=$AZURITE_KEY;BlobEndpoint=http://$RUN_ID-deps:10000/devstoreaccount1;QueueEndpoint=http://$RUN_ID-deps:10001/devstoreaccount1;TableEndpoint=http://$RUN_ID-deps:10002/devstoreaccount1;")
    ;;
  mssql)
    docker run -d --name "$RUN_ID-deps" --network "$NET" -e ACCEPT_EULA=1 -e "MSSQL_SA_PASSWORD=$SQL_PASSWORD" \
      mcr.microsoft.com/azure-sql-edge:latest >/dev/null
    wait_for "SQL" sh -c "docker logs '$RUN_ID-deps' 2>&1 | grep -q 'SQL Server is now ready for client connections'"
    APP_ENV+=(-e "DFM_SQL_CONNECTION_STRING=Server=$RUN_ID-deps;Database=DurableDB;User Id=sa;Password=$SQL_PASSWORD;TrustServerCertificate=True")
    ;;
  *) echo "Unsupported backend: $BACKEND" >&2; exit 2 ;;
esac

if [ "${SMOKE_OTEL:-0}" = 1 ]; then
  docker run -d --name "$RUN_ID-otel" --network "$NET" \
    -v "$SCRIPT_DIR/otel-collector-smoke.yaml:/etc/otelcol/config.yaml:ro" \
    otel/opentelemetry-collector:latest --config=/etc/otelcol/config.yaml >/dev/null
  APP_ENV+=(-e "OTEL_EXPORTER_OTLP_ENDPOINT=http://$RUN_ID-otel:4317" -e "OTEL_SERVICE_NAME=dfm-smoke" \
    -e "OTEL_METRIC_EXPORT_INTERVAL=5000" -e "OTEL_BLRP_SCHEDULE_DELAY=1000" -e "OTEL_BSP_SCHEDULE_DELAY=1000")
fi

docker run -d --name "$RUN_ID-app" --platform "$PLATFORM" --network "$NET" -p 127.0.0.1::80 \
  "${APP_ENV[@]}" "$IMAGE" >/dev/null || fail "could not start $IMAGE for $PLATFORM"

MACHINE="$(docker exec "$RUN_ID-app" uname -m)"
[ "$MACHINE" = "$EXPECTED_MACHINE" ] || fail "expected $EXPECTED_MACHINE container, got $MACHINE"

PORT="$(docker port "$RUN_ID-app" 80/tcp | head -1 | sed 's/.*://')"
BASE="http://127.0.0.1:$PORT"

wait_for "GET /" sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' -H 'x-dfm-nonce: $NONCE' $BASE/)\" = 200 ]"
curl -s -H "x-dfm-nonce: $NONCE" "$BASE/" | grep -q '<div id="root">' || fail "GET / did not serve the DfMon SPA"

RESPONSE="$(curl -s -w '\n%{http_code}' -H "x-dfm-nonce: $NONCE" "$BASE/durable-functions-monitor/a/p/i/task-hub-names")"
CODE="${RESPONSE##*$'\n'}"
BODY="${RESPONSE%$'\n'*}"
case "$BACKEND" in
  storage)
    [ "$CODE" = 200 ] && [ "${BODY:0:1}" = "[" ] || fail "task-hub-names returned $CODE: $BODY"
    ;;
  mssql)
    # DfMon has no orchestrators, so the SQL provider never creates DurableDB: SQL rejecting the login
    # for that database proves the container's SqlClient reached the server.
    printf '%s' "$BODY" | grep -q 'Cannot open database "DurableDB"' || fail "task-hub-names did not reach SQL: $CODE $BODY"
    ;;
esac

OTEL_SUFFIX=""
if [ "${SMOKE_OTEL:-0}" = 1 ]; then
  for signal in '"resource spans"' '"log records"' '"data points"'; do
    wait_for "OTLP $signal" sh -c "docker logs '$RUN_ID-otel' 2>&1 | grep -q '$signal'"
  done
  OTEL_SUFFIX=" (otel)"
fi

echo "SMOKE PASS: $IMAGE $PLATFORM $BACKEND$OTEL_SUFFIX"
```

Then: `chmod +x docker/smoke-test.sh`

- [ ] **Step 3: Prove the script accepts a working image (current published amd64 image)**

Run: `SMOKE_TIMEOUT=300 docker/smoke-test.sh scaletone/durablefunctionsmonitor:6.8 linux/amd64 storage`
Expected: `SMOKE PASS: scaletone/durablefunctionsmonitor:6.8 linux/amd64 storage`. On an Apple Silicon Mac this runs under emulation, which is why the timeout is longer.

- [ ] **Step 4: Run it for arm64 and watch it fail (the red test)**

Run: `docker/smoke-test.sh scaletone/durablefunctionsmonitor:6.8 linux/arm64 storage`
Expected: `SMOKE FAIL: could not start scaletone/durablefunctionsmonitor:6.8 for linux/arm64`, with docker reporting `no matching manifest for linux/arm64`.

- [ ] **Step 5: Commit**

```bash
git add docker/smoke-test.sh docker/otel-collector-smoke.yaml
git commit -m "Add Docker image smoke test (per image, platform and backend)"
```

---

### Task 4: Shared multi-arch Dockerfile

**Files:**
- Create: `docker/Dockerfile`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: Task 1 (net10 exes) and Task 3 (`docker/smoke-test.sh`).
- Produces: `docker buildx build -f docker/Dockerfile --build-arg PROJECT=<csproj path relative to repo root> --platform <p> .`. The build-arg values used by CI in Task 7 are `durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj` and `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj`.

- [ ] **Step 1: Write the Dockerfile**

Create `docker/Dockerfile`:

```dockerfile
# Builds a DfMon .NET Isolated app into a linux/amd64 or linux/arm64 image.
# Official mcr.microsoft.com/azure-functions images are amd64-only, so the Functions host is built from source
# (same approach as https://github.com/Azure/azure-functions-docker/blob/dev/custom-container/template.Dockerfile).
#
#   docker buildx build -f docker/Dockerfile --platform linux/amd64,linux/arm64 \
#     --build-arg PROJECT=durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj .

# Get the latest host from https://github.com/Azure/azure-functions-host/releases
ARG HOST_VERSION=4.1054.200

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS host-builder
ARG HOST_VERSION
ARG TARGETARCH
RUN git clone --depth 1 --branch v${HOST_VERSION} https://github.com/Azure/azure-functions-host /src/azure-functions-host
# ReadyToRun is off: its Crossgen2 pack for linux-arm64 isn't served by the host repo's NuGet feed without auth.
# Language workers (node, java, python, powershell) are dropped: dotnet-isolated brings its own worker.
RUN RID=linux-$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) && \
    dotnet publish /src/azure-functions-host/src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
      -c Release -v q /p:CI=true -p:PublishReadyToRun=false \
      --runtime $RID --self-contained --output /azure-functions-host && \
    rm -rf /azure-functions-host/workers/*

FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:10.0 AS app-builder
ARG PROJECT
RUN test -n "$PROJECT" || (echo "PROJECT build-arg (path to .csproj) is required" && false)
COPY . /src
RUN dotnet publish "/src/$PROJECT" -c Release --output /home/site/wwwroot

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG HOST_VERSION
ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    HOME=/home \
    FUNCTIONS_WORKER_RUNTIME=dotnet-isolated \
    ASPNETCORE_URLS=http://+:80 \
    DOTNET_USE_POLLING_FILE_WATCHER=true \
    HOST_VERSION=${HOST_VERSION} \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true
COPY --from=host-builder /azure-functions-host /azure-functions-host
COPY --from=app-builder /home/site/wwwroot /home/site/wwwroot
EXPOSE 80
CMD ["/azure-functions-host/Microsoft.Azure.WebJobs.Script.WebHost"]
```

- [ ] **Step 2: Write the root `.dockerignore`**

Create `.dockerignore`:

```
.git
.github
**/bin
**/obj
**/node_modules
**/local.settings.json
durablefunctionsmonitor-vscodeext
durablefunctionsmonitor.react
durablefunctionsmonitor.dotnetbackend
tests
readme
docs
NOTICE.txt
```

`durablefunctionsmonitor.dotnetisolated/DfmStatics` (committed, and refreshed by CI from the React build) is what the images serve. Don't ignore it.

- [ ] **Step 3: Build and smoke-test the native arch (arm64 on Apple Silicon, amd64 elsewhere)**

Run (Apple Silicon; on x86 swap `arm64` for `amd64`):
```bash
docker buildx build -f docker/Dockerfile --platform linux/arm64 --load -t dfm:arm64 \
  --build-arg PROJECT=durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj .
docker/smoke-test.sh dfm:arm64 linux/arm64 storage

docker buildx build -f docker/Dockerfile --platform linux/arm64 --load -t dfm-mssql:arm64 \
  --build-arg PROJECT=custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj .
docker/smoke-test.sh dfm-mssql:arm64 linux/arm64 mssql
```
Expected: `SMOKE PASS: dfm:arm64 linux/arm64 storage` and `SMOKE PASS: dfm-mssql:arm64 linux/arm64 mssql`. This is the Task 3 red test turning green. If a build fails with `No space left on device`, run `docker builder prune -af` and retry.

- [ ] **Step 4: Cross-build and smoke-test the other arch**

Run (Apple Silicon; the run uses Rosetta/QEMU emulation, hence the longer timeout):
```bash
docker buildx build -f docker/Dockerfile --platform linux/amd64 --load -t dfm:amd64 \
  --build-arg PROJECT=durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj .
SMOKE_TIMEOUT=300 docker/smoke-test.sh dfm:amd64 linux/amd64 storage
```
Expected: `SMOKE PASS: dfm:amd64 linux/amd64 storage`

- [ ] **Step 5: Check the missing build-arg guard**

Run: `docker buildx build -f docker/Dockerfile --platform linux/arm64 . 2>&1 | grep -c "PROJECT build-arg"`
Expected: a count ≥ 1, and the build fails.

- [ ] **Step 6: Commit**

```bash
git add docker/Dockerfile .dockerignore
git commit -m "Add shared linux/amd64 + linux/arm64 Dockerfile for .NET Isolated DfMon

Official Azure Functions base images are amd64-only, so the Functions host
is built from source for the target architecture."
```

---

### Task 5: OpenTelemetry (logs, traces, metrics over OTLP)

> Ruling: OpenTelemetry **1.19.x** (current stable). The user asked for "latest version 1.9.x", and 1.19 is the latest.

**Files:**
- Create: `durablefunctionsmonitor.dotnetisolated/OpenTelemetrySetup.cs`
- Modify: `durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj`
- Modify: `durablefunctionsmonitor.dotnetisolated/Program.cs`
- Modify: `durablefunctionsmonitor.dotnetisolated/host.json`
- Modify: `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj`
- Modify: `custom-backends/dotnetIsolated-mssql/Program.cs`
- Modify: `custom-backends/dotnetIsolated-mssql/host.json`
- Modify: `durablefunctionsmonitor.dotnetisolated/README.md`, `custom-backends/dotnetIsolated-mssql/README.md`

**Interfaces:**
- Consumes: Task 3 (`SMOKE_OTEL=1` mode) and Task 4 (image build commands).
- Produces: `internal static IHostBuilder ConfigureDfmOpenTelemetry(this IHostBuilder hostBuilder)` in namespace `DurableFunctionsMonitor.DotNetIsolated`. It is compiled into both exes, and the mssql exe gets it through a linked `<Compile>` item.

Why the wiring differs from the generic skill template: DfMon's worker uses `HostBuilder().ConfigureFunctionsWorkerDefaults(...)` (not ASP.NET Core integration) and has no Application Insights. So there's no `AddAspNetCoreInstrumentation` (HTTP is handled by the host and arrives over gRPC) and no App Insights coexistence glue. The host's own request telemetry comes from `"telemetryMode": "OpenTelemetry"` in host.json, and the host reads the same `OTEL_EXPORTER_OTLP_*` variables.

- [ ] **Step 1: Write the failing test (OTel mode of the smoke test against the Task 4 image)**

Run: `SMOKE_TIMEOUT=60 SMOKE_OTEL=1 docker/smoke-test.sh dfm:arm64 linux/arm64 storage` (use `amd64` on x86)
Expected: `SMOKE FAIL: OTLP "resource spans" not ready within 60s`. Nothing exports yet.

- [ ] **Step 2: Add the shared setup file**

Create `durablefunctionsmonitor.dotnetisolated/OpenTelemetrySetup.cs`:

```csharp
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace DurableFunctionsMonitor.DotNetIsolated
{
    /// <summary>
    /// Exports worker logs, traces and metrics via OTLP. Only active when OTEL_EXPORTER_OTLP_ENDPOINT is set,
    /// the rest of the exporter config (headers, protocol, service name) comes from OTEL_* env variables as well.
    /// </summary>
    internal static class OpenTelemetrySetup
    {
        public static IHostBuilder ConfigureDfmOpenTelemetry(this IHostBuilder hostBuilder)
        {
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT")))
            {
                return hostBuilder;
            }

            return hostBuilder
                .ConfigureLogging(logging => logging.AddOpenTelemetry(options =>
                {
                    options.IncludeFormattedMessage = true;
                    options.IncludeScopes = true;
                }))
                .ConfigureServices(services => services.AddOpenTelemetry()
                    .UseFunctionsWorkerDefaults()
                    .WithTracing(tracing => tracing.AddHttpClientInstrumentation())
                    .WithMetrics(metrics => metrics
                        .AddHttpClientInstrumentation()
                        .AddRuntimeInstrumentation())
                    // Registers the logs signal, so that UseOtlpExporter() exports logs too
                    .WithLogging()
                    .UseOtlpExporter());
        }
    }
}
```

- [ ] **Step 3: Add the packages to both exes and link the file into the mssql exe**

In `durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj`, add to the `<PackageReference>` ItemGroup (after `Microsoft.IdentityModel.Protocols.OpenIdConnect`):

```xml
    <PackageReference Include="Microsoft.Azure.Functions.Worker.OpenTelemetry" Version="1.2.0" />
    <PackageReference Include="OpenTelemetry.Exporter.OpenTelemetryProtocol" Version="1.19.1" />
    <PackageReference Include="OpenTelemetry.Extensions.Hosting" Version="1.19.1" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Http" Version="1.19.0" />
    <PackageReference Include="OpenTelemetry.Instrumentation.Runtime" Version="1.19.0" />
```

In `custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj`, add the same five lines to the ItemGroup containing `Microsoft.Azure.Functions.Worker.Sdk`, and add this ItemGroup after the "Copying statics" one:

```xml
  <!-- Shared OpenTelemetry setup -->
  <ItemGroup>
    <Compile Include="$(MSBuildThisFileDirectory)\..\..\durablefunctionsmonitor.dotnetisolated\OpenTelemetrySetup.cs" Link="OpenTelemetrySetup.cs" />
  </ItemGroup>
```

- [ ] **Step 4: Call it from both Program.cs files**

In `durablefunctionsmonitor.dotnetisolated/Program.cs`, change:

```csharp
                })
                .Build();
```

to:

```csharp
                })
                .ConfigureDfmOpenTelemetry()
                .Build();
```

Make the identical change in `custom-backends/dotnetIsolated-mssql/Program.cs`, and add `using DurableFunctionsMonitor.DotNetIsolated;` to its usings (its namespace is `Dfm.DotNetIsolatedMsSql`).

- [ ] **Step 5: Switch the host to OpenTelemetry mode**

`durablefunctionsmonitor.dotnetisolated/host.json` becomes:

```json
{
  "version": "2.0",
  "telemetryMode": "OpenTelemetry",
  "extensions": {
    "http": {
      "routePrefix": ""
    },
    "durableTask": {
      "storageProvider": {
        "type": "AzureStorage",
        "FetchLargeMessagesAutomatically": false
      }
    }
  }
}
```

`custom-backends/dotnetIsolated-mssql/host.json` becomes:

```json
{
  "version": "2.0",
  "telemetryMode": "OpenTelemetry",
  "extensions": {
    "http": {
      "routePrefix": ""
    },
    "durableTask": {
      "storageProvider": {
        "type": "mssql",
        "connectionStringName": "DFM_SQL_CONNECTION_STRING",
        "taskEventLockTimeout": "00:02:00",
        "createDatabaseIfNotExists": true
      }
    }
  }
}
```

- [ ] **Step 6: Build both exes**

Run: `dotnet build durablefunctionsmonitor.dotnetisolated -c Release && dotnet build custom-backends/dotnetIsolated-mssql -c Release`
Expected: `Build succeeded` twice, with no `NU1605`/`NU1608` version conflicts.

- [ ] **Step 7: Rebuild the images and run the OTel test plus the default (no-OTel) regression**

Run (swap `arm64` for `amd64` on x86):
```bash
docker buildx build -f docker/Dockerfile --platform linux/arm64 --load -t dfm:arm64 \
  --build-arg PROJECT=durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj .
docker buildx build -f docker/Dockerfile --platform linux/arm64 --load -t dfm-mssql:arm64 \
  --build-arg PROJECT=custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj .
SMOKE_OTEL=1 docker/smoke-test.sh dfm:arm64 linux/arm64 storage
docker/smoke-test.sh dfm:arm64 linux/arm64 storage
SMOKE_OTEL=1 docker/smoke-test.sh dfm-mssql:arm64 linux/arm64 mssql
docker/smoke-test.sh dfm-mssql:arm64 linux/arm64 mssql
```
Expected: four `SMOKE PASS` lines, two of them ending in `(otel)`.

- [ ] **Step 8: Document the settings**

Append to both `durablefunctionsmonitor.dotnetisolated/README.md` and `custom-backends/dotnetIsolated-mssql/README.md`:

```markdown
## OpenTelemetry

DfMon can export its logs, traces and metrics via OTLP. Export is off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

| Setting | Purpose | Example |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint (enables export) | `http://otel-collector:4317` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` (default) or `http/protobuf` | `http/protobuf` |
| `OTEL_EXPORTER_OTLP_HEADERS` | Auth headers, if your backend needs them | `Authorization=Api-Token <token>` |
| `OTEL_SERVICE_NAME` | Service name shown in your backend | `durable-functions-monitor` |

To try it locally, run the [.NET Aspire dashboard](https://learn.microsoft.com/en-us/dotnet/aspire/fundamentals/dashboard/standalone) (`docker run --rm -d -p 18888:18888 -p 4317:18889 mcr.microsoft.com/dotnet/aspire-dashboard:latest`) and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317`.
```

- [ ] **Step 9: Commit**

```bash
git add durablefunctionsmonitor.dotnetisolated custom-backends/dotnetIsolated-mssql
git commit -m "Export logs, traces and metrics via OpenTelemetry OTLP (opt-in via OTEL_EXPORTER_OTLP_ENDPOINT)"
```

---

### Task 6: DfMon Activities: readable traces and spans

**Files:**
- Create: `durablefunctionsmonitor.dotnetisolated.core/Common/DfmTelemetry.cs`
- Modify: `durablefunctionsmonitor.dotnetisolated.core/Common/ExtensionMethods.cs` (the `UseWhen` middleware, lines ~74-138)
- Modify: the operation sites listed in Step 3 (under `durablefunctionsmonitor.dotnetisolated.core/Functions/` and `Common/Auth.cs`)
- Modify: `durablefunctionsmonitor.dotnetisolated/OpenTelemetrySetup.cs`
- Modify: `docker/otel-collector-smoke.yaml`, `docker/smoke-test.sh`
- Test: `tests/durablefunctionsmonitor.dotnetisolated.core.tests/DfmTelemetryTests.cs`

**Interfaces:**
- Consumes: `OpenTelemetrySetup.ConfigureDfmOpenTelemetry()` (Task 5), and the smoke test with `SMOKE_OTEL=1` (Task 3).
- Produces: `public static class DfmTelemetry` in namespace `DurableFunctionsMonitor.DotNetIsolated`, containing:
  - `public const string ActivitySourceName = "DurableFunctionsMonitor";`
  - `internal static readonly ActivitySource ActivitySource` (version = the core assembly's informational/file version)
  - `internal static Activity? StartActivity(string name, ActivityKind kind = ActivityKind.Internal)`: thin wrapper over `ActivitySource.StartActivity`
  - `internal static void RecordError(this Activity? activity, Exception ex)`: sets `ActivityStatusCode.Error` with `ex.Message`, adds the standard `exception` event (`exception.type`, `exception.message`, `exception.stacktrace`), and is a no-op on null.

Use `System.Diagnostics` only. The core library gets **no** OpenTelemetry package reference, so NuGet consumers pay nothing unless they listen. Instrumentation stays in core so that injection-mode users (who host DfMon inside their own app) also get the spans if they `AddSource("DurableFunctionsMonitor")`.

**Span conventions** (apply them consistently; the goal is a trace that reads like the actual work):
- Names are lower-case, dot-separated, `dfm.<area>.<action>`, e.g. `dfm.orchestrations.list`.
- Attribute keys: `dfm.function` (Function name), `dfm.operation_kind` (`Read`/`Write`), `dfm.conn_name`, `dfm.hub_name`, `dfm.instance_id`, `dfm.mode` (`Normal`/`ReadOnly`), `dfm.result_count` (int, when cheaply known), `dfm.filter.field`, `dfm.purge.entity_type`, `dfm.purge.instances_deleted`.
- **Never** record user names, claims, tokens, connection strings, orchestration inputs/outputs or custom status payloads. Instance ids and hub names are fine.
- On failure call `activity.RecordError(ex)` and rethrow. The existing error handling stays exactly as it is.

- [ ] **Step 1: Write the failing tests**

Create `tests/durablefunctionsmonitor.dotnetisolated.core.tests/DfmTelemetryTests.cs` with an `ActivityListener` fixture (`ShouldListenTo = s => s.Name == DfmTelemetry.ActivitySourceName`, `Sample = AllDataAndRecorded`, collecting stopped activities into a list; dispose it in `[TestCleanup]`). Cover:
1. `ActivitySourceName` is `"DurableFunctionsMonitor"`, and `StartActivity("dfm.test")` returns a non-null activity with that `OperationName` when the listener is attached.
2. `StartActivity` returns null when no listener is attached (no allocation cost for users without OTel).
3. `RecordError` sets `Status == ActivityStatusCode.Error`, `StatusDescription == ex.Message`, and adds one event named `exception` whose `exception.type` tag equals `ex.GetType().FullName`. `((Activity?)null).RecordError(ex)` does not throw.
4. An operation-level span: call an instrumented operation reachable from the existing test fakes (e.g. `Auth.GetAllowedTaskHubNamesAsync` with a fake `DfmExtensionPoints.GetTaskHubNamesRoutine` returning `["Hub1","Hub2"]` and `DFM_HUB_NAME` unset). Assert that a `dfm.task_hubs.load` span was recorded with `dfm.result_count == 2`.

The test project already references core, and `InternalsVisibleTo` for the test assembly may need adding. Check `durablefunctionsmonitor.dotnetisolated.core.csproj`/`AssemblyInfo`. If internals aren't visible, add `<InternalsVisibleTo Include="durablefunctionsmonitor.dotnetisolated.core.tests" />` to the core csproj.

- [ ] **Step 2: Run tests, confirm they fail**

Run: `dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests --filter FullyQualifiedName~DfmTelemetryTests`
Expected: build error `The name 'DfmTelemetry' does not exist`.

- [ ] **Step 3: Implement `DfmTelemetry` and instrument**

Create `DfmTelemetry.cs` per Interfaces. Then instrument:
1. **Middleware** (`ExtensionMethods.cs` `UseWhen`): for DfMon functions only (`operationKind.HasValue`), wrap the whole invocation in `dfm.request` with `dfm.function` = `context.FunctionDefinition.Name` and `dfm.operation_kind`. Nest child spans `dfm.auth.validate_identity` (tag `dfm.mode` with the result) and `dfm.auth.validate_task_hub` around the two auth calls. In each existing `catch`, call `RecordError` on `dfm.request` before the existing handling. Unauthorized/Forbidden also set status Error.
2. **Hot paths**, one span each, placed around the actual work with the attributes that make it readable:
   - `Orchestrations.cs` list → `dfm.orchestrations.list` (`dfm.conn_name`, `dfm.hub_name`, `dfm.filter.field`). The pipeline is lazy, so the span must cover the `ReturnJson` enumeration, not just the query construction.
   - `Orchestration.cs`: get details → `dfm.orchestration.get`, history → `dfm.orchestration.history`, start → `dfm.orchestration.start`, action post → `dfm.orchestration.<action>` (e.g. `dfm.orchestration.terminate`), custom tab → `dfm.orchestration.render_template` (each with `dfm.instance_id`).
   - `PurgeHistory.cs` → `dfm.history.purge` (`dfm.purge.entity_type`, `dfm.purge.instances_deleted`).
   - `CleanEntityStorage.cs` → `dfm.entities.clean`. `DeleteTaskHub.cs` → `dfm.task_hub.delete`. `IdSuggestions.cs` → `dfm.orchestrations.id_suggestions`. `FunctionMap.cs` → `dfm.function_map.get`.
   - `Auth.GetAllowedTaskHubNamesAsync` / the task-hub-names load → `dfm.task_hubs.load` (`dfm.result_count`).
   Don't instrument `ServeStatics` or `About` (noise).
3. `OpenTelemetrySetup.cs`: change the tracing line to `.WithTracing(tracing => tracing.AddSource(DfmTelemetry.ActivitySourceName).AddHttpClientInstrumentation())`.

- [ ] **Step 4: Run all core tests**

Run: `dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests`
Expected: all pass (59 existing + the new ones).

- [ ] **Step 5: Prove the spans reach the collector end-to-end**

In `docker/otel-collector-smoke.yaml` change `verbosity: basic` to `verbosity: detailed`. In `docker/smoke-test.sh`, inside the `SMOKE_OTEL` block after the signal loop, add:

```bash
  wait_for "DfMon spans" sh -c "docker logs '$RUN_ID-otel' 2>&1 | grep -q 'dfm.task_hubs.load'"
```

Rebuild the storage image (Task 4 Step 3 command) and run `SMOKE_OTEL=1 docker/smoke-test.sh dfm:arm64 linux/arm64 storage` (`amd64` on x86).
Expected: `SMOKE PASS: dfm:arm64 linux/arm64 storage (otel)`.

- [ ] **Step 6: Commit**

```bash
git add durablefunctionsmonitor.dotnetisolated.core durablefunctionsmonitor.dotnetisolated/OpenTelemetrySetup.cs tests/durablefunctionsmonitor.dotnetisolated.core.tests docker
git commit -m "Add DurableFunctionsMonitor ActivitySource with spans for auth and DfMon operations"
```

---

### Task 7: CI: native-runner smoke tests and multi-arch push

**Files:**
- Create: `.github/workflows/docker-smoke.yml`
- Modify: `.github/workflows/main-build.yml`
- Modify: `.github/workflows/push-to-docker-hub.yml`
- Modify: `.github/workflows/push-to-nuget.yml`
- Delete: `durablefunctionsmonitor.dotnetbackend/Dockerfile`, `durablefunctionsmonitor.dotnetbackend/.dockerignore`, `custom-backends/mssql/Dockerfile`, `custom-backends/netherite/Dockerfile`

**Interfaces:**
- Consumes: `docker/Dockerfile` (Task 4) and `docker/smoke-test.sh <image> <platform> <backend>` with `SMOKE_OTEL` (Tasks 3 and 5).
- Produces: a reusable workflow `docker-smoke.yml` with input `statics-artifact` (string, default `''`). When set, it downloads that artifact into `durablefunctionsmonitor.dotnetisolated/DfmStatics` before building.

Pinned action SHAs (all verified during planning):
- `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0` (existing)
- `actions/setup-dotnet@67a3573c9a986a3f9c594539f4ab511d57bb3ce9 # v4.3.1` (existing)
- `actions/upload-artifact@1eb3cb2b3e0f29609092a73eb033bb759a334595 # v4.1.0` (existing)
- `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0` (new)
- `docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1` (new)
- `docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9 # v3.7.0` (existing)
- `docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6.19.2` (existing)

- [ ] **Step 1: Write the reusable smoke workflow**

Create `.github/workflows/docker-smoke.yml`:

```yaml

name: docker-smoke

on:
  workflow_call:
    inputs:
      statics-artifact:
        description: Name of an artifact with a fresh React build to serve instead of the committed DfmStatics
        type: string
        default: ''

jobs:
  smoke:

    strategy:
      fail-fast: false
      matrix:
        arch:
          - { platform: linux/amd64, runner: ubuntu-24.04 }
          - { platform: linux/arm64, runner: ubuntu-24.04-arm }
        image:
          - { backend: storage, project: durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj }
          - { backend: mssql, project: custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj }

    runs-on: ${{ matrix.arch.runner }}

    steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

    - name: use fresh React build for DfmStatics
      if: inputs.statics-artifact != ''
      uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
      with:
        name: ${{ inputs.statics-artifact }}
        path: durablefunctionsmonitor.dotnetisolated/DfmStatics

    - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1

    - name: build ${{ matrix.image.backend }} image for ${{ matrix.arch.platform }}
      uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6.19.2
      with:
        context: .
        file: docker/Dockerfile
        platforms: ${{ matrix.arch.platform }}
        build-args: PROJECT=${{ matrix.image.project }}
        load: true
        tags: dfm-smoke:local
        cache-from: type=gha,scope=${{ matrix.image.backend }}-${{ matrix.arch.runner }}
        cache-to: type=gha,mode=max,scope=${{ matrix.image.backend }}-${{ matrix.arch.runner }}

    - name: smoke test
      run: docker/smoke-test.sh dfm-smoke:local ${{ matrix.arch.platform }} ${{ matrix.image.backend }}

    - name: smoke test with OpenTelemetry export
      run: SMOKE_OTEL=1 docker/smoke-test.sh dfm-smoke:local ${{ matrix.arch.platform }} ${{ matrix.image.backend }}
```

- [ ] **Step 2: main-build: install both SDKs and call the smoke workflow**

In `.github/workflows/main-build.yml`, replace:

```yaml
      with:
        dotnet-version: 8.0.x
```

with:

```yaml
      with:
        dotnet-version: |
          8.0.x
          10.0.x
```

and append at the end of the file, as a sibling of `build:` under `jobs:`:

```yaml

  docker-smoke:
    uses: ./.github/workflows/docker-smoke.yml
```

- [ ] **Step 3: push-to-nuget: install both SDKs**

In `.github/workflows/push-to-nuget.yml`, make the same `dotnet-version` replacement as in Step 2.

- [ ] **Step 4: Rewrite push-to-docker-hub**

Replace the whole of `.github/workflows/push-to-docker-hub.yml` with:

```yaml

name: push-to-docker-hub

on:
  workflow_dispatch:
    inputs:
      imageTag:
        description: Docker image tag to be applied
        required: true

jobs:
  statics:

    runs-on: ubuntu-24.04

    steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

    - name: npm install durablefunctionsmonitor.react
      run: npm install -legacy-peer-deps
      working-directory: durablefunctionsmonitor.react
    - name: npm build durablefunctionsmonitor.react
      run: npm run build
      working-directory: durablefunctionsmonitor.react

    - name: publish React build
      uses: actions/upload-artifact@1eb3cb2b3e0f29609092a73eb033bb759a334595 # v4.1.0
      with:
        name: dfmstatics
        path: durablefunctionsmonitor.react/build

  test:

    runs-on: ubuntu-24.04

    steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

    - name: Setup .NET
      uses: actions/setup-dotnet@67a3573c9a986a3f9c594539f4ab511d57bb3ce9 # v4.3.1
      with:
        dotnet-version: 10.0.x

    - name: dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests
      run: dotnet test tests/durablefunctionsmonitor.dotnetisolated.core.tests/*.csproj

  smoke:
    needs: statics
    uses: ./.github/workflows/docker-smoke.yml
    with:
      statics-artifact: dfmstatics

  push:
    needs: [ test, smoke ]

    runs-on: ubuntu-24.04

    steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0

    - name: use fresh React build for DfmStatics
      uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
      with:
        name: dfmstatics
        path: durablefunctionsmonitor.dotnetisolated/DfmStatics

    - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1

    - name: login to Docker hub
      uses: docker/login-action@c94ce9fb468520275223c153574b00df6fe4bcc9 # v3.7.0
      with:
        username: ${{ secrets.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}

    - name: build and push durablefunctionsmonitor.dotnetisolated
      uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6.19.2
      with:
        context: .
        file: docker/Dockerfile
        platforms: linux/amd64,linux/arm64
        build-args: PROJECT=durablefunctionsmonitor.dotnetisolated/durablefunctionsmonitor.dotnetisolated.csproj
        push: true
        tags: scaletone/durablefunctionsmonitor:${{ github.event.inputs.imageTag }}

    - name: build and push custom-backends/dotnetIsolated-mssql
      uses: docker/build-push-action@10e90e3645eae34f1e60eeb005ba3a3d33f178e8 # v6.19.2
      with:
        context: .
        file: docker/Dockerfile
        platforms: linux/amd64,linux/arm64
        build-args: PROJECT=custom-backends/dotnetIsolated-mssql/Dfm.DotNetIsolatedMsSql.csproj
        push: true
        tags: scaletone/durablefunctionsmonitor.mssql:${{ github.event.inputs.imageTag }}
```

The in-process `dotnetbackend.tests` step is removed from this workflow because the image no longer contains the in-process backend. `main-build` still runs it.

- [ ] **Step 5: Delete the in-process Dockerfiles**

```bash
git rm durablefunctionsmonitor.dotnetbackend/Dockerfile durablefunctionsmonitor.dotnetbackend/.dockerignore custom-backends/mssql/Dockerfile custom-backends/netherite/Dockerfile
```

- [ ] **Step 6: Lint the workflows**

Run: `brew install actionlint 2>/dev/null; actionlint .github/workflows/*.yml`
Expected: no output (exit 0). Also confirm every `uses:` line is pinned:
`grep -hE '^\s*-?\s*uses:' .github/workflows/*.yml | grep -vE '@[0-9a-f]{40} # v|uses: \./'`
Expected: no output.

- [ ] **Step 7: Commit and push a branch to exercise CI**

```bash
git add .github/workflows
git commit -m "CI: smoke-test images on native amd64/arm64 runners; push multi-arch images; drop netherite image"
git push -u origin HEAD
```

Then open a PR (or run `main-build` via `workflow_dispatch` on the branch) and check: `gh run watch` → all 4 `docker-smoke / smoke (...)` jobs green. Do **not** run `push-to-docker-hub`. Publishing images is the maintainer's call.

---

### Task 8: Azure Container Apps hosting

**Files:**
- Create: `deploy/aca/main.bicep`
- Create: `deploy/aca/main.bicepparam.example`
- Create: `deploy/aca/README.md`
- Modify: `durablefunctionsmonitor.dotnetisolated/README.md` (one link line)

**Interfaces:**
- Consumes: the images from Task 7 (`scaletone/durablefunctionsmonitor`, `scaletone/durablefunctionsmonitor.mssql`), which listen on port 80 and take the settings documented in the READMEs.
- Produces: `az deployment group create -g <rg> -f deploy/aca/main.bicep -p <params>` deploys a working DfMon on Azure Container Apps.

DfMon runs as a **plain container app**. It is not the "Functions on Container Apps" (`kind: functionapp`) flavour, because the image carries its own Functions host. Auth works exactly as on AKS (`dfm-aks-deployment.yaml`): DfMon validates AAD tokens itself via `WEBSITE_AUTH_CLIENT_ID` + `WEBSITE_AUTH_OPENID_ISSUER`. Container Apps built-in auth is **not** configured.

- [ ] **Step 1: Write the Bicep template**

`deploy/aca/main.bicep` must have:
- Params: `location` (default `resourceGroup().location`), `name` (default `'dfmon'`), `backend` (`@allowed(['storage','mssql'])`, default `'storage'`), `imageTag` (required), `@secure() connectionString` (required: the Azure Storage connection string for `storage`, the SQL connection string for `mssql`), `authClientId` (required), `authIssuer` (default `'https://login.microsoftonline.com/${tenant().tenantId}/v2.0'`), `allowedUserNames` (default `''`), `allowedAppRoles` (default `''`), `otlpEndpoint` (default `''`), `@secure() otlpHeaders` (default `''`), `minReplicas` (default `1`), `maxReplicas` (default `3`).
- Resources: a Log Analytics workspace (`Microsoft.OperationalInsights/workspaces`, `PerGB2018`, 30 days), a Container Apps environment wired to it, and a container app with:
  - image `scaletone/durablefunctionsmonitor:${imageTag}` or `scaletone/durablefunctionsmonitor.mssql:${imageTag}` by `backend`
  - external HTTPS ingress, `targetPort: 80`, `allowInsecure: false`
  - secret `connection-string` referenced by env `AzureWebJobsStorage` (storage) or `DFM_SQL_CONNECTION_STRING` (mssql)
  - env `WEBSITE_AUTH_CLIENT_ID`, `WEBSITE_AUTH_OPENID_ISSUER`. Add `DFM_ALLOWED_USER_NAMES`, `DFM_ALLOWED_APP_ROLES`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (as a secret), and `OTEL_SERVICE_NAME=name` **only when their param is non-empty** (an empty `DFM_ALLOWED_*` value makes DfMon reject every role list; see Task 1 findings). Build the env array with conditional concatenation.
  - resources `cpu: json('0.5')`, `memory: '1Gi'`; liveness + readiness **TCP** probes on port 80 (every DfMon HTTP route requires auth, so HTTP probes would fail)
  - scale `minReplicas`/`maxReplicas` with an HTTP rule (`concurrentRequests: '50'`)
- Output: `url` = `https://${app.properties.configuration.ingress.fqdn}`.
- Never set `DFM_NONCE` (that would turn auth off on a public endpoint).

- [ ] **Step 2: Validate it compiles and lints clean**

Run: `az bicep build --file deploy/aca/main.bicep --stdout >/dev/null && az bicep lint --file deploy/aca/main.bicep`
Expected: exit 0 with no warnings. Fix any `no-hardcoded-env-urls`/`secure-secrets-in-params` warnings the linter raises.

- [ ] **Step 3: Parameters example**

Create `deploy/aca/main.bicepparam.example` using `using 'main.bicep'`, with placeholder values (`imageTag = '7.0'`, `authClientId = '<your-aad-app-client-id>'`, `connectionString = '<your-storage-connection-string>'`, `allowedUserNames = 'you@contoso.com'`). Run `cp deploy/aca/main.bicepparam.example /tmp/t.bicepparam && sed -i.bak "s#using 'main.bicep'#using '$(pwd)/deploy/aca/main.bicep'#" /tmp/t.bicepparam && az bicep build-params --file /tmp/t.bicepparam --stdout >/dev/null`.
Expected: exit 0.

- [ ] **Step 4: Validate against Azure without deploying (if logged in)**

Run: `az account show >/dev/null 2>&1 && az deployment group what-if -g <an-existing-rg> -f deploy/aca/main.bicep -p deploy/aca/main.bicepparam.example --no-pretty-print >/dev/null || echo "skipped: not logged in"`
Expected: either the what-if succeeds or the command prints `skipped: not logged in`. Record which one in the report. Do **not** run `az deployment group create`.

- [ ] **Step 5: Docs**

`deploy/aca/README.md`: prerequisites (AAD app registration with redirect URI `https://<fqdn>` and ID tokens enabled, the same steps as the existing "How to configure authentication" wiki link used in the other READMEs), a copy-paste `az group create` + `az deployment group create ... -p main.bicepparam` flow, how to add the redirect URI after the first deploy (the FQDN is only known then), and notes that ACA runs linux/amd64 and that `minReplicas: 0` is possible but adds a cold start. Add one line to `durablefunctionsmonitor.dotnetisolated/README.md` under the Docker section: `To host on Azure Container Apps, see [deploy/aca](../deploy/aca/README.md).`

- [ ] **Step 6: Commit**

```bash
git add deploy/aca durablefunctionsmonitor.dotnetisolated/README.md
git commit -m "Add Azure Container Apps Bicep deployment for DfMon images"
```

---

### Task 9: Docker docs

**Files:**
- Modify: `durablefunctionsmonitor.dotnetisolated/README.md`
- Modify: `custom-backends/dotnetIsolated-mssql/README.md`
- Modify: `custom-backends/mssql/README.md:34-45`
- Modify: `custom-backends/netherite/README.md:39-50`

**Interfaces:**
- Consumes: the image names and platforms from Task 7.
- Produces: nothing code-level.

- [ ] **Step 1: Add a Docker section to the isolated README**

Append to `durablefunctionsmonitor.dotnetisolated/README.md` (before the OpenTelemetry section from Task 5):

```markdown
## How to run [as a Docker container](https://hub.docker.com/r/scaletone/durablefunctionsmonitor)

Images are published for `linux/amd64` and `linux/arm64`.

* `docker pull scaletone/durablefunctionsmonitor:[put-latest-tag-here]`
* `docker run -p 7072:80 -e AzureWebJobsStorage="your-storage-connection-string" -e DFM_NONCE="i_sure_know_what_i_am_doing" scaletone/durablefunctionsmonitor:[put-latest-tag-here]`

   WARNING: setting **DFM_NONCE** to `i_sure_know_what_i_am_doing` **turns authentication off**. Please, protect your endpoint as appropriate.

* Navigate to http://localhost:7072
```

- [ ] **Step 2: Move the mssql Docker section to the isolated mssql README**

Cut lines 34-45 of `custom-backends/mssql/README.md` (the `## How to run [as a Docker container]...` section through `* Navigate to http://localhost:7072`) and paste them into `custom-backends/dotnetIsolated-mssql/README.md` before its `## How to deploy to Azure` heading. Add this line right under the pasted heading:

```markdown
Images are published for `linux/amd64` and `linux/arm64`.
```

In `custom-backends/mssql/README.md`, put this in place of the removed section:

```markdown
## How to run as a Docker container

The `scaletone/durablefunctionsmonitor.mssql` image is now built from the [.NET Isolated MSSQL backend](../dotnetIsolated-mssql/README.md#how-to-run-as-a-docker-container).
```

- [ ] **Step 3: Mark the netherite image as discontinued**

Replace lines 39-50 of `custom-backends/netherite/README.md` (the Docker section) with:

```markdown
## Docker image (discontinued)

New versions of `scaletone/durablefunctionsmonitor.netherite` are no longer published. Existing tags stay available on [Docker Hub](https://hub.docker.com/r/scaletone/durablefunctionsmonitor.netherite).
```

- [ ] **Step 4: Check the links**

Run: `grep -rn "dotnetIsolated-mssql/README.md#how-to-run-as-a-docker-container" custom-backends/mssql/README.md && grep -n "## How to run \[as a Docker container\]" custom-backends/dotnetIsolated-mssql/README.md`
Expected: one match from each command. The GitHub anchor for the heading `How to run [as a Docker container](...)` is `#how-to-run-as-a-docker-container`.

- [ ] **Step 5: Commit**

```bash
git add durablefunctionsmonitor.dotnetisolated/README.md custom-backends/dotnetIsolated-mssql/README.md custom-backends/mssql/README.md custom-backends/netherite/README.md
git commit -m "Docs: multi-arch Docker images now built from .NET Isolated; netherite image discontinued"
```

---

## Out of scope (follow-ups to raise with the user)

- Moving the in-process package, the VS Code extension backend and the `netcore21`/`netcore31`/`mssql`/`netherite` custom backends off in-process. In-process support ends 10 Nov 2026.
- A .NET Isolated Netherite backend.
- Version bump and release notes (the maintainer decides; this is a breaking change for NuGet/ARM users, so likely 7.0.0).
- Bumping `HOST_VERSION` monthly for host security patches (consider a Dependabot/Renovate regex rule on `docker/Dockerfile`).
