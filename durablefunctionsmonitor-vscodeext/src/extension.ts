// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

import { MonitorTreeDataProvider } from './MonitorTreeDataProvider';
import { FunctionGraphList } from './FunctionGraphList';
import { Settings } from './Settings';

var monitorTreeDataProvider: MonitorTreeDataProvider;
var functionGraphList: FunctionGraphList;

// Name for our logging OutputChannel
const OutputChannelName = 'Durable Functions Monitor';

export function activate(context: vscode.ExtensionContext) {

    // For logging
    const logChannel = Settings().enableLogging ? vscode.window.createOutputChannel(OutputChannelName) : undefined;
    if (!!logChannel) {
        context.subscriptions.push(logChannel);
    }

    functionGraphList = new FunctionGraphList(context, logChannel);
    monitorTreeDataProvider = new MonitorTreeDataProvider(context, functionGraphList, logChannel);

    context.subscriptions.push(

        vscode.debug.onDidStartDebugSession(() => monitorTreeDataProvider.handleOnDebugSessionStarted()),

        vscode.window.registerTreeDataProvider('durableFunctionsMonitorTreeView', monitorTreeDataProvider),

        vscode.commands.registerCommand('extension.durableFunctionsMonitor',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false)),
        
        vscode.commands.registerCommand('extension.durableFunctionsMonitorPurgeHistory',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false, { id: 'purgeHistory' })),

        vscode.commands.registerCommand('extension.durableFunctionsMonitorCleanEntityStorage',
            () => monitorTreeDataProvider.createOrActivateMonitorView(false, { id: 'cleanEntityStorage' })),

        vscode.commands.registerCommand('extension.durableFunctionsMonitorGotoInstanceId',
            () => monitorTreeDataProvider.gotoInstanceId(null)),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.purgeHistory',
            (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'purgeHistory' })),

        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.cleanEntityStorage',
            (item) => monitorTreeDataProvider.attachToTaskHub(item, { id: 'cleanEntityStorage' })),

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
        
        vscode.commands.registerCommand('extension.durableFunctionsMonitorVisualizeAsGraph',
            (item) => functionGraphList.visualize(item)),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.openInstancesInStorageExplorer',
            (item) => monitorTreeDataProvider.openTableInStorageExplorer(item, 'Instances')),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.openHistoryInStorageExplorer',
            (item) => monitorTreeDataProvider.openTableInStorageExplorer(item, 'History')),
        
        vscode.commands.registerCommand('durableFunctionsMonitorTreeView.forgetConnectionString',
            (item) => monitorTreeDataProvider.forgetConnectionString(item)),
    );
}

export function deactivate() {
    functionGraphList.cleanup();
    return monitorTreeDataProvider.cleanup();
}