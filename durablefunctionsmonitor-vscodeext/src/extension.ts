// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

import { MonitorTreeDataProvider } from './MonitorTreeDataProvider';
import { FunctionGraphList } from './FunctionGraphList';
import { VSCodeAzureSubscriptionProvider } from '@microsoft/vscode-azext-azureauth';

var monitorTreeDataProvider: MonitorTreeDataProvider;
var functionGraphList: FunctionGraphList;

// Name for our logging OutputChannel
const OutputChannelName = 'Durable Functions Monitor';

export function activate(context: vscode.ExtensionContext) {

    // For logging
    const logChannel = vscode.window.createOutputChannel(OutputChannelName);
    context.subscriptions.push(logChannel);

    const azureProvider = new VSCodeAzureSubscriptionProvider();

    functionGraphList = new FunctionGraphList(context, logChannel);
    monitorTreeDataProvider = new MonitorTreeDataProvider(azureProvider, context, functionGraphList, logChannel);

    context.subscriptions.push(

        vscode.debug.onDidStartDebugSession(() => monitorTreeDataProvider.handleOnDebugSessionStarted()),

        vscode.window.registerTreeDataProvider('durableFunctionsMonitorTreeView', monitorTreeDataProvider),

        vscode.commands.registerCommand('durable-functions-monitor.signInToAzure',
            async () => { 
                await azureProvider.signIn();
                monitorTreeDataProvider.refresh();
            }),

        vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitor',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false)),
        
        vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitorPurgeHistory',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false, { id: 'purgeHistory' })),

        vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitorCleanEntityStorage',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false, { id: 'cleanEntityStorage' })),

            vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitorBatchOps',
                () => monitorTreeDataProvider.createOrActivateMonitorView(false, { id: 'batchOps' })),
            
        vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitorGotoInstanceId',
            () => monitorTreeDataProvider.gotoInstanceId(null)),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.purgeHistory',
            (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'purgeHistory' })),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.cleanEntityStorage',
            (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'cleanEntityStorage' })),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.batchOps',
            (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'batchOps' })),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.startNewInstance',
        (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'startNewInstance' })),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.attachToTaskHub',
            (item) => monitorTreeDataProvider.attachToTaskHub(item)),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.detachFromTaskHub',
            (item) => monitorTreeDataProvider.detachFromTaskHub(item)),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.deleteTaskHub',
            (item) => monitorTreeDataProvider.deleteTaskHub(item)),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.gotoInstanceId',
            (item) => monitorTreeDataProvider.gotoInstanceId(item)),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.refresh',
            () => monitorTreeDataProvider.refresh()),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.attachToAnotherTaskHub',
            () => monitorTreeDataProvider.createOrActivateMonitorView(true)),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.detachFromAllTaskHubs',
            () => monitorTreeDataProvider.detachFromAllTaskHubs()),
        
        vscode.commands.registerCommand('durable-functions-monitor.durableFunctionsMonitorVisualizeAsGraph',
            (item) => functionGraphList.visualize(item)),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.openInstancesInStorageExplorer',
            (item) => monitorTreeDataProvider.openTableInStorageExplorer(item, 'Instances')),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.openHistoryInStorageExplorer',
            (item) => monitorTreeDataProvider.openTableInStorageExplorer(item, 'History')),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.forgetConnectionString',
            (item) => monitorTreeDataProvider.forgetConnectionString(item)),
        
        azureProvider,
    );
}

export function deactivate() {
    functionGraphList.cleanup();
    return monitorTreeDataProvider.cleanup();
}