# Durable Functions Monitor as a VsCode Extension

List/monitor/debug your Azure Durable Functions inside VsCode.

**Command Palette -> Durable Functions Monitor**, or (if you have [Azure Functions](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurefunctions) extension also installed) **Azure Functions View Container -> DURABLE FUNCTIONS**, or right-click on your **host.json** file and use the context menu.

## Features

* Get a bird's eye view of any Azure Functions project in form of a graph - **Command Palette -> Visualize Functions as a Graph...**. 
* List your Orchestrations and/or Durable Entities, with sorting, infinite scrolling and auto-refresh.
* Monitor the status of a certain Orchestration/Durable Entity. Restart, Purge, Rewind, Terminate, Raise Events.
* Start new orchestration instances - **Azure Functions View Container -> DURABLE FUNCTIONS -> [right-click on your TaskHub] -> Start New Orchestration Instance...**
* Quickly navigate to an Orchestration/Entity instance by its ID - **Command Palette -> Durable Functions Monitor: Go to instanceId...** or **Azure Functions View Container -> DURABLE FUNCTIONS -> [right-click on your TaskHub] -> Go to instanceId...**
* Purge Orchestrations/Durable Entities history - **Command Palette -> Durable Functions Monitor: Purge History...**
* Cleanup deleted Durable Entities - **Command Palette -> Durable Functions Monitor: Clean Entity Storage...**
* Observe all Task Hubs in your Azure Subscription and connect to them - **Azure Functions View Container -> DURABLE FUNCTIONS**
* Delete Task Hubs - **Command Palette -> Delete Task Hub...**

## Pictures

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-command-palette.png" width="624">

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-orchestrations.png" width="768">

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-orchestration.png" width="843">

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/gantt-chart.png" width="843">

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/vscodeext-orchestration-diagram.png" width="600">

<img src="https://raw.githubusercontent.com/microsoft/DurableFunctionsMonitor/main/readme/screenshots/function-graph.png" width="800">

## Prerequisites

Make sure you have the latest [Azure Functions Core Tools](https://www.npmjs.com/package/azure-functions-core-tools) globally installed on your devbox.

More info and sources on [the github repo](https://github.com/microsoft/DurableFunctionsMonitor#features).
