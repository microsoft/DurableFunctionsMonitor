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

After installing this extension from the Marketplace or from a VSIX-file you have multiple ways to show the **DfMon**'s main window:
* (Most typical, but requires being logged in into Azure) go to **AZURE** view container, expand the **DURABLE FUNCTIONS** tab and click on a Task Hub that you wish to monitor:

  ![image](https://user-images.githubusercontent.com/5447190/148263305-d96cc6ab-9308-4253-9e19-8f4c987166d8.png)

  NOTE: if you don't see your Azure Subscription there, run the **Azure: Select Subscriptions** command and configure Subscription filtering.

* Run the **Durable Functions Monitor** command via Command Palette, provide the storage connection string and a Task Hub name.
* (If you have your Azure Functions project opened) right-click on the **host.json** file and use one of the context menus:

  ![image](https://user-images.githubusercontent.com/5447190/148263042-e91fac9b-f305-40aa-bc11-44fff495df06.png)

* **DfMon** will also propose to automatically open the current Task Hub when you start a debugging session for an Azure Functions project.

When attaching to Task Hubs, **DfMon** starts [the backend](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend) as a separate process (one process per each Storage account). You can use the tree view buttons/menu items to explicitly start/stop these backend processes:

  ![image](https://user-images.githubusercontent.com/5447190/148265469-5cf645a7-4425-4684-9166-733be17fdb8b.png)

You can also generate and view [Function Graphs](https://github.com/microsoft/DurableFunctionsMonitor/wiki/How-to-generate-and-use-Function-Graphs) for arbitrary Azure Functions projects. Use the **Visualize Functions as a Graph...** command for that.

## Prerequisites

* Make sure you have the latest [Azure Functions Core Tools](https://www.npmjs.com/package/azure-functions-core-tools) globally installed on your devbox.

* For most features to work you also need to have [Azure Account](https://marketplace.visualstudio.com/items?itemName=ms-vscode.azure-account) extension installed and be logged in into Azure. To login into Azure execute the **Azure: Sign In** command in Command Palette. To filter the list of Azure subscriptions shown execute the **Azure: Select Subscriptions** command.

## How to compile and run this project locally

This project is a typical [VsCode extension](https://code.visualstudio.com/api/get-started/your-first-extension), so to run/debug it locally you just open these sources in your VsCode and press F5. 
But before that you'll need to get the [backend](https://github.com/microsoft/DurableFunctionsMonitor/tree/main/durablefunctionsmonitor.dotnetbackend) binaries compiled and copied:
* Go to **durablefunctionsmonitor.dotnetbackend** folder.
* Execute `dotnet publish -o ../durablefunctionsmonitor-vscodeext/backend` there with your command line. This will compile the backend and place its binaries into the newly created **durablefunctionsmonitor-vscodeext/backend** subfolder.

Now you'll also need to do `npm install` in **durablefunctionsmonitor-vscodeext** folder. 

Then finally you can press F5. This will start a sandbox VsCode instance, with **DfMon** extension running in it from sources. 

