# Change Log

## Version 5.5

- Support for identity-based connections (#40). When [storage keys are disabled](https://docs.microsoft.com/en-us/azure/storage/common/shared-key-authorization-prevent?tabs=portal#remediate-authorization-via-shared-key) for some Storage account, DfMon will try to connect to it on *your* behalf (using your VsCode Azure login). Accounts like that will be marked as `identity-based` in the tree:
    ![image](https://user-images.githubusercontent.com/5447190/172019768-4a04553b-5804-4c11-bd7c-182f34cb4bdb.png)
    
    NOTE: you will need to have all the required role assignments to that Storage account, [as described here](https://docs.microsoft.com/en-gb/azure/azure-functions/functions-reference?tabs=blob#connecting-to-host-storage-with-an-identity-preview).

- Bugfixes.

## Version 5.4.1

- Updated instance diagrams to make them work better for orchestrations with large amounts of activities. 

## Version 5.4.0

- Bugfixes.

## Version 5.3.0

- Client-side filter string is now highlighted:

    <img width="500px" src="https://user-images.githubusercontent.com/5447190/159587046-4ab257e6-5a75-45b2-8c04-61f7ef6131c2.png"/>

- Bugfixes.

## Version 5.2.0

- Mostly technical release (to finalize the move to this new repo), but one useful feature was added - client-side filtering:

    <img width="600px" src="https://user-images.githubusercontent.com/5447190/155412087-792bfdd1-42ac-4610-aff3-3e35a230961f.png"/>

    Use the 'Funnel' button on top of every column to start filtering, then type some text (case-insensitive) and press 'Enter' - only the instances containing that text in their corresponding fields will be shown.
    
    NOTE: this is a _client-side_ filter, so it works slower than the main, top-level query tools.

- Minor bugfixes.

## Version 5.1.0

- Instance execution history can now be filtered by time and other field values:
![image](https://user-images.githubusercontent.com/5447190/140803804-84ef440b-bce7-432d-aaf9-4b663f2ef5cd.png)

- 'In' and 'Not In' filter operators. Filter values should be comma-separated or in form of a JSON array.
- Backend migrated to .Net Core 3.1.
- Direct requests that DfMon makes against Azure Table Storage now contain custom **User-Agent** header: `DurableFunctionsMonitor-Standalone`, `DurableFunctionsMonitor-VsCodeExt` or `DurableFunctionsMonitor-Injected`. Note that the majority of calls is still done via DurableClient, and those cannot be instrumented like this yet.
- Minor bugfixes.

## Version 5.0.0

- UI improvements for instance filter and in some other places.
- Minor bugfixes.

## Version 4.8.2

- Minor hotfix (DfMon's View Container might become unresponsive after a debug session).

## Version 4.8.1

- Workaround for https://github.com/Azure/azure-functions-durable-extension/issues/1926 (being unable to execute .Reset() and .StartNew() against a Task Hub named 'TestHubName').

## Version 4.8

- 'Start New Orchestration Instance' feature:
<img width="200px" src="https://user-images.githubusercontent.com/5447190/130657962-c1c32575-c82c-4e29-ad88-3951eb821fe8.png"/>
<img width="400px" src="https://user-images.githubusercontent.com/5447190/130658737-e51e259d-e7ec-43a2-902b-79907936fb82.png"/>

- Should now work seamlessly in [GitHub Codespaces](https://github.com/features/codespaces).
- Full support for [Microsoft SQL storage provider](https://github.com/microsoft/durabletask-mssql).
- Latest [az-func-as-a-graph](https://github.com/scale-tone/az-func-as-a-graph) integrated.
- Minor bugfixes.

## Version 4.7.1

- Hotfix for incompatibility with Storage Emulator ([#112](https://github.com/scale-tone/DurableFunctionsMonitor/issues/112)).

## Version 4.7

- Latest [az-func-as-a-graph](https://github.com/scale-tone/az-func-as-a-graph) integrated, and it is now used as yet another visualization tab for both search results and instance details, with instance counts and statuses rendered on top of it. So it now acts as an *animated* code map of your project:
![image](https://user-images.githubusercontent.com/5447190/127571400-f83c7f96-55bc-4714-8323-04d26f3be74f.png)

- 'Open XXXInstances/XXXHistory in Storage Explorer' menu items for Task Hubs:
<img src="https://user-images.githubusercontent.com/5447190/127571803-4502d249-9963-4f70-9c4e-8aa1397bf06e.png" width="300">

- Long JSON (or just long error messages) can now be viewed in a popup window ([#109](https://github.com/scale-tone/DurableFunctionsMonitor/issues/109)).
- Minor bugfixes.

## Version 4.6

- Added a sortable **Duration** column to the list of results. Now you can quickly find quickest and longest instances.
- Gantt charts are now interactive (lines are clickable).
- Custom backends: you can now switch to a .Net Core 3.1 backend, or even to your own customized one:

    ![image](https://user-images.githubusercontent.com/5447190/123545702-c3aeb500-d759-11eb-9d6d-7c69db167ca2.png)

- (Limited) support for [Microsoft SQL storage provider](https://github.com/microsoft/durabletask-mssql). When you open a project that uses it, the relevant Task Hub should appear in the **DURABLE FUNCTIONS** view container:

    ![image](https://user-images.githubusercontent.com/5447190/123545989-281e4400-d75b-11eb-865e-b8aa3cee690a.png)

- Minor bugfixes.

## Version 4.5

- Time can now be shown in local time zone. **File->Preferences->Settings->Durable Functions Monitor->Show Time As**.
- F# support for Functions Graphs.
- Instance Details tab is now integrated with Functions Graph. If relevant Functions project is currently open, the Details tab will allow navigating to Functions Graph and to Orchestration/Entity/Activity source code.
- Minor bugfixes.

## Version 4.4

- Now you can get a quick overview of _any_ Azure Functions project in form of a graph. **Command Palette -> Visualize Functions as a Graph...**. For Durable Functions/Durable Entities the tool also tries to infer and show their relationships. Function nodes are clickable and lead to function's code.
- Minor bugfixes.

## Version 4.3

- Fixed time ranges ('Last Minute', 'Last Hour' etc.).
- Multiple choice for filtering by instance status ('Running', 'Completed' etc.).
- 'Not Equals', 'Not Starts With' and 'Not Contains' filter operators.
- Performance improvements.
- Minor bugfixes.

## Version 4.2

- Orchestrations/Entities are now also visualized as a time histogram and as a Gantt chart. Time histogram is interactive, you can zoom it in/out with your mouse.
<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/time-histogram.png" width="400">

- 'Send Signal' button for Durable Entities.
- Minor bugfixes.

## Version 4.1

- Dark color mode.
- Minor bugfixes.

## Version 4.0

- It is now one backend per Storage Account, not per each Task Hub. Works faster and consumes less resources.
- Minor bugfixes.

## Version 3.9

- Gantt Charts for orchestrations (in addition to Sequence Diagrams).
- 'Go to instanceId...' feature to quickly navigate to an orchestration/entity instance by its id (with autocomplete supported). **Right-click on a Task Hub->Go to instanceId...**.
- DotLiquid replaced with [Fluid](https://github.com/sebastienros/fluid) for rendering custom status tabs. [Fluid](https://github.com/sebastienros/fluid) looks much more mature (most of [Liquid](https://shopify.github.io/liquid/) seems to be supported) and more alive library.
- 'Save as .SVG' button for diagrams.
- Status tabs now refresh much smoother.
- Minor bugfixes.

## Version 3.8

- WebViews are now persistent (do not reload every time you switch between them) and even persist their state (filters, sorting etc.) across restarts.
- 'Restart' button for orchestrations (triggers the new [.RestartAsync()](https://github.com/Azure/azure-functions-durable-extension/pull/1545) method).
- Sequence diagrams now show some timing (start times and durations).
- 'Detach from all Task Hubs...' button for quickly killing all backends.
- All logs (when enabled) now go to 'Durable Functions Monitor' output channel.
- Minor bugfixes.

## Version 3.7

- Now settings are stored in VsCode's settings.json. **File->Preferences->Settings->Durable Functions Monitor**: 
<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-settings.png" width="400">

- Local Storage Emulator, Azure Government and other exotic Storage Account types are now supported. If your Local Storage Emulator is running and there're some TaskHubs in it - they will appear automatically on your Azure Functions View Container (if not, try to modify the 'Storage Emulator Connection String' parameter on the Settings page).

- Long-awaited 'Cancel' button on the Orchestrations page.

- Now you can hide the columns you're not interested in:
<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/hide-columns.png" width="350">

- Minor other UI improvements.

## Version 3.6

- 'Clear Entity Storage...' menu item for doing garbage collection of deleted Durable Entities. Executes the recently added [IDurableEntityClient.CleanEntityStorageAsync()](https://docs.microsoft.com/en-us/dotnet/api/microsoft.azure.webjobs.extensions.durabletask.idurableentityclient.cleanentitystorageasync?view=azure-dotnet) method.

- Custom status visualisation for orchestrations/entities in form of [Liquid templates](https://shopify.github.io/liquid/). 
  1. Create a [DotLiquid](https://github.com/dotliquid/dotliquid) template file. 
  2. Name it like `[My Custom Tab Name].[orchestration-or-entity-name].liquid` or just `[My Custom Tab Name].liquid` (this one will be applied to any kind of entity).
  3. In the same Storage Account create a container called `durable-functions-monitor`.
  4. Put your template file into a `tab-templates` virtual folder in that container (the full path should look like `/durable-functions-monitor/tab-templates/[My Custom Tab Name].[orchestration-or-entity-name].liquid`).
  5. Restart Durable Functions Monitor.
  6. Observe the newly appeared `My Custom Tab Name` tab on the Orchestration/Entity Details page.

- Performance improvements for loading the list of Orchestrations/Entities.

## Version 3.5

- Now the **Orchestration Details** page features a nice [mermaid](https://www.npmjs.com/package/mermaid)-based sequence diagram:
<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-orchestration-diagram-small.png">
- Also it's now possible to navigate to suborchestrations from the history list on the **Orchestration Details** page.

## Version 3.4

- Now integrated with [Azure Account](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account) extension, so once logged in to Azure, you can now see and connect to all your TaskHubs. It is also still possible to connect with connection strings, as before. NOTE1: only filtered Azure Subscriptions are shown, so make sure your filter is set correctly with [Azure: Select Subscriptions](https://docs.microsoft.com/en-us/azure/governance/policy/how-to/extension-for-vscode#select-subscriptions) command. NOTE2: many things can go wrong when fetching the list of TaskHubs, so to investigate those problems you can [enable logging](https://github.com/microsoft/DurableFunctionsMonitor/blob/main/durablefunctionsmonitor-vscodeext/CHANGELOG.md#version-21) and then check the 'Durable Functions Monitor' output channel.

## Version 3.3

- customStatus value of your orchestration instances can now be changed with 'Set Custom Status' button.
- Minor bugfixes.

## Version 3.2

- You can now delete unused Task Hubs with 'Delete Task Hub...' context menu item.
- Better (non-native) DateTime pickers.

## Version 3.1

- Minor security improvements.
- List of existing Task Hubs is now loaded from your Storage Account and shown to you, when connecting to a Task Hub.

## Version 3.0

- A 'DURABLE FUNCTIONS' TreeView added to Azure Functions View Container. It displays all currently attached Task Hubs, allows to connect to multiple Task Hubs and switch between them. You need to have [Azure Functions](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions) extension installed to see it (which is typically the case if you work with Azure Functions in VSCode).

## Version 2.2

- Bulk purge for Durable Entities as well.
- Prettified JSON on instance details page.

## Version 2.1

- Instances list sort order is now persisted as well.
- Whenever backend initialization fails, its error message is now being shown immediately (instead of a generic 'timeout' message as before).
- A complete backend output can now be logged into a file for debugging purposes. Open the **settings.json** file in extension's folder and set the **logging** setting to **true**. That will produce a **backend/backend-37072.log** file with full console output from func.exe.

## Version 2.0

- More native support for Durable Entities.
- Backend migrated to Microsoft.Azure.WebJobs.Extensions.DurableTask 2.0.0. Please, ensure you have the latest Azure Functions Core Tools installed globally, otherwise the backend might fail to start.
- Now displaying connection info (storage account name/hub name) in the tab title.

## Version 1.3

- Implemented purging orchestration instance history. Type 'Purge Durable Functions History...' in your Command Palette.
- Added a context menu over a **host.json** file.
