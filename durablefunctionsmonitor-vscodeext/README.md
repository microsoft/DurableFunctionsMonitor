# Durable Functions Monitor as a VsCode Extension

List/monitor/debug your Azure Durable Functions inside VsCode.

![image](https://user-images.githubusercontent.com/5447190/148266774-fab07560-17bd-4022-947d-137719109f67.png)

## Features

* Get a bird's eye view of any Azure Functions project in form of a graph - **Command Palette -> Visualize Functions as a Graph...**. 
* List your Orchestrations and/or Durable Entities, with sorting, infinite scrolling and auto-refresh.
* Monitor the status of a certain Orchestration/Durable Entity. Restart, Purge, Rewind, Terminate, Raise Events.
* Start new orchestration instances - **AZURE view container -> DURABLE FUNCTIONS -> [right-click on your TaskHub] -> Start New Orchestration Instance...**
* Quickly navigate to an Orchestration/Entity instance by its ID - **Command Palette -> Durable Functions Monitor: Go to instanceId...** or **Azure Functions View Container -> DURABLE FUNCTIONS -> [right-click on your TaskHub] -> Go to instanceId...**
* Purge Orchestrations/Durable Entities history - **Command Palette -> Durable Functions Monitor: Purge History...**
* Cleanup deleted Durable Entities - **Command Palette -> Durable Functions Monitor: Clean Entity Storage...**
* Observe all Task Hubs in your Azure Subscription and connect to them - **AZURE view container -> DURABLE FUNCTIONS**
* Delete Task Hubs - **Command Palette -> Delete Task Hub...**

See the [complete list of features in our wiki](https://github.com/microsoft/DurableFunctionsMonitor/wiki#features).

## How to run

After installing this extension from the Marketplace or from a VSIX-file the **DURABLE FUNCTIONS** tab should appear on **AZURE** view container:

<img src="https://user-images.githubusercontent.com/5447190/216991871-b3f221e0-0bdc-4c4e-8c5a-a1e84b4b48a7.png" width="300px" style="display:block; margin:auto"/>

NOTE: if you don't have [Azure Account](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account) extension installed, the tab will appear on the default **EXPLORER** view container.

**DURABLE FUNCTIONS** tab shows Task Hubs automatically discovered from:
* Your Azure Subscription(s), if you're signed in into Azure. To sign in into Azure use `Azure: Sign In` command. To (un)filter the list of shown Azure Subscriptions, use `Azure: Select Subscriptions` command.
* Your currently opened project, if it is an Azure Functions project.
* Local Storage Emulator, if it is running.

In addition to that you can also connect to arbitrary Storage accounts or Microsoft SQL Server/Azure SQL databases. Either click on ![image](https://user-images.githubusercontent.com/5447190/216996327-8a31e4cf-9446-4302-b147-f85fb0a85b9c.png)
 button or use `Attach to Task Hub...` command. You will be asked for a Connection String (it can be either Azure Storage or Microsoft SQL Server connection string) and a Task Hub name to connect to. The entered Connection Strings are persisted with [VsCode SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) (On Windows you should be able to see them in Windows Credential Manager). 

### Listing Orchestrations/Durable Entities

To connect to a Task Hub just click on it. This shows the main page with all Orchestrations/Durable Entities in that Task Hub:

<img src="https://user-images.githubusercontent.com/5447190/217001085-7a4fc4fa-1983-4c2e-8e11-d7648a570cd4.png" width="600px" style="display:block; margin:auto"/>

The list of instances is filterable/searchable/sortable/scrollable with infinite scroll. Other ways to visualize search results are:
* **Time Histogram**:

  <img src="https://user-images.githubusercontent.com/5447190/217002540-bfa70639-2631-4c0d-b4cf-994097b3c1c9.png" width="600px" style="display:block; margin:auto"/>

* **Gantt Chart**:

  <img src="https://user-images.githubusercontent.com/5447190/217002828-26ec711d-b744-44f6-bb1e-a7bb5fac263f.png" width="600px" style="display:block; margin:auto"/>

* **Interactive (clickable) [Functions Graph](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-generate-and-use-Function-Graphs)**:

  <img src="https://user-images.githubusercontent.com/5447190/217003248-0de23654-4e24-4a4d-9666-4e82ef38471c.png" width="600px" style="display:block; margin:auto"/>

### Observing/managing Orchestration/Durable Entity instances

Clicking on an Orchestration/Entity instance show its **Details** page:

  <img src="https://user-images.githubusercontent.com/5447190/217006475-f3453bdc-95c6-4fb2-80c4-33cff6504863.png" width="600px" style="display:block; margin:auto"/>

Orchestration's Execution History can be observed in form of:

* **Filterable List**:

  <img src="https://user-images.githubusercontent.com/5447190/217007314-3b1263ec-570a-4eb9-9b86-9fb011e72587.png" width="500px" style="display:block; margin:auto"/>

* **Sequence Diagram**:

  <img src="https://user-images.githubusercontent.com/5447190/217007695-b35a309d-602a-4388-b2e9-b2f46b873636.png" width="500px" style="display:block; margin:auto"/>

* **Gantt Chart**:

  <img src="https://user-images.githubusercontent.com/5447190/217007915-f953ff4c-5c13-425e-9b1e-213b3f3c6ba3.png" width="500px" style="display:block; margin:auto"/>

* **Interactive (clickable) [Functions Graph](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-generate-and-use-Function-Graphs)**:

  <img src="https://user-images.githubusercontent.com/5447190/217008072-ca5cf05c-712e-48a3-b77b-b163bf04ece7.png" width="500px" style="display:block; margin:auto"/>

To Suspend/Resume/Restart/Rewind/Terminate/Raise Event/Set Custom Status/Purge an instance use the relevant buttons:

  <img src="https://user-images.githubusercontent.com/5447190/217009843-49bda21b-1ea4-49e9-a123-96b4aa0de939.png" width="500px" style="display:block; margin:auto"/>

It is also possible to create/configure custom details tabs using [Liquid templates](https://shopify.github.io/liquid/). [Learn here how to do that](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-create-custom-Orchestration%5CEntity-status-tabs-with-Liquid-Templates).

### Other tools

To **Purge Orchestration History/Clean Entity Storage/Delete a Task Hub** right-click on a Task Hub:

  <img src="https://user-images.githubusercontent.com/5447190/217011829-a2a06871-648e-4434-bcf3-2f7508fe996e.png" width="300px" style="display:block; margin:auto"/>

and follow the flow.


## Prerequisites

* Make sure you have the latest [Azure Functions Core Tools](https://www.npmjs.com/package/azure-functions-core-tools) globally installed on your devbox.

* [Azure Account](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account) VsCode extension is not required, but highly recommended. To login into Azure execute the **Azure: Sign In** command in Command Palette. To filter the list of Azure subscriptions shown execute the **Azure: Select Subscriptions** command.

## How to compile and run this project locally

This project is a typical [VsCode extension](https://code.visualstudio.com/api/get-started/your-first-extension), so to run/debug it locally you just open these sources in your VsCode and press F5. 
But before that you'll need to get the [backend](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend) binaries compiled and copied:
* Go to [durablefunctionsmonitor.dotnetbackend](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend) folder.
* Execute `dotnet publish -o ../durablefunctionsmonitor-vscodeext/backend` there with your command line. This will compile the backend and place its binaries into the newly created **durablefunctionsmonitor-vscodeext/backend** subfolder.

Now you'll also need to do `npm install` in **durablefunctionsmonitor-vscodeext** folder. 

Then finally you can press F5. This will start a sandbox VsCode instance, with **DfMon** extension running in it from sources. 

