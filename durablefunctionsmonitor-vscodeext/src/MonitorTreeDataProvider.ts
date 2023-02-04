// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';
import { StorageManagementClient } from "@azure/arm-storage";
import { StorageAccount, StorageAccountKey } from "@azure/arm-storage/src/models";

import { AzureConnectionInfo, MonitorView } from "./MonitorView";
import { MonitorViewList, getTaskHubNamesFromTableStorage, getTaskHubNamesFromTableStorageWithUserToken } from "./MonitorViewList";
import { FunctionGraphList } from './FunctionGraphList';
import { Settings, UpdateSetting } from './Settings';
import { StorageConnectionSettings, AzureSubscription } from "./StorageConnectionSettings";
import { ConnStringUtils } from './ConnStringUtils';

// Root object in the hierarchy. Also serves data for the TreeView.
export class MonitorTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> { 

    private readonly _log: (line: string) => void;

    constructor(private _context: vscode.ExtensionContext, functionGraphList: FunctionGraphList, logChannel?: vscode.OutputChannel) {

        this._log = !logChannel ? () => { } : (l) => logChannel.append(l);

        // Using Azure Account extension to connect to Azure, get subscriptions etc.
        const azureAccountExtension = vscode.extensions.getExtension('ms-vscode.azure-account');

        // Typings for azureAccount are here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
        this._azureAccount = !!azureAccountExtension ? azureAccountExtension.exports : undefined;

        this._monitorViews = new MonitorViewList(this._context,
            functionGraphList,
            (connString) => this.getTokenCredentialsForGivenConnectionString(connString),
            () => this._onDidChangeTreeData.fire(undefined),
            this._log);

        this._resourcesFolderPath = this._context.asAbsolutePath('resources');
        
        if (!!this._azureAccount && !!this._azureAccount.onFiltersChanged) {

            // When user changes their list of filtered subscriptions (or just relogins to Azure)...
            this._context.subscriptions.push(this._azureAccount.onFiltersChanged(() => this.refresh()));
        }
    }

    // Does nothing, actually
    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    // Returns the children of `element` or root if no element is passed.
    async getChildren(parent: vscode.TreeItem): Promise<vscode.TreeItem[]> {

        const result: vscode.TreeItem[] = [];

        try {

            switch (parent?.contextValue)
            {
                case undefined:

                    result.push({
                        contextValue: 'subscriptions',
                        label: 'Azure Subscriptions',
                        tooltip: 'Shows Task Hubs automatically discovered from all your Azure Storage accounts',
                        iconPath: path.join(this._resourcesFolderPath, 'azureSubscriptions.svg'),
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                    });

                    result.push({
                        contextValue: 'connectionStrings',
                        label: 'Stored Connection Strings',
                        tooltip: `These Connection Strings are persisted in VsCode's SecretStorage`,
                        iconPath: new vscode.ThemeIcon('plug'),
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                    });

                    const curConnSettings = this._monitorViews.getStorageConnectionSettingsFromCurrentProject('TestHubName');
                    if (!!curConnSettings) {

                        result.push({
                            contextValue: 'localProject',
                            label: 'Local Project',
                            tooltip: 'Task Hub used by your currently opened project',
                            iconPath: {
                                light: path.join(this._resourcesFolderPath, 'light', 'localProject.svg'),
                                dark: path.join(this._resourcesFolderPath, 'dark', 'localProject.svg')
                            },
                            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
                        });
                    }

                    result.push({
                        contextValue: 'storageEmulator',
                        label: 'Local Storage Emulator',
                        tooltip: 'Shows Task Hubs automatically discovered in your local Azure Storage Emulator',
                        iconPath: path.join(this._resourcesFolderPath, 'storageEmulator.svg'),
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                    });
                    
                    break;
                
                case 'subscriptions':

                    if (!this._azureAccount  || (!await this._azureAccount.waitForFilters())) {

                        result.push({
                            label: 'Sign in to Azure...',
                            command: {
                                title: 'Sign in to Azure...',
                                command: 'azure-account.login',
                                arguments: []
                            }
                        });

                    } else {

                        for (const sub of this._azureAccount.filters) {

                            const node: SubscriptionTreeItem = {
                                contextValue: 'subscription',
                                label: sub.subscription.displayName,
                                iconPath: path.join(this._resourcesFolderPath, 'azureSubscription.svg'),
                                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                                azureSubscription: sub,
                            };

                            result.push(node);
                        }
                    }
                    
                    break;
                
                case 'subscription':

                    const subscriptionsNode = parent as SubscriptionTreeItem;

                    const storageAccountsAndTaskHubs = await this.getStorageAccountsAndTaskHubs(subscriptionsNode.azureSubscription!);

                    for (const acc of storageAccountsAndTaskHubs) {

                        const storageConnString = ConnStringUtils.getConnectionStringForStorageAccount(acc.account, acc.storageKey);

                        const isAttached = this._monitorViews.isBackendAttached(storageConnString)

                        let iconPath = '';
                        if (acc.account.kind == 'StorageV2') {
                            iconPath = path.join(this._resourcesFolderPath, isAttached ? 'storageAccountV2Attached.svg' : 'storageAccountV2.svg');
                        } else {
                            iconPath = path.join(this._resourcesFolderPath, isAttached ? 'storageAccountAttached.svg' : 'storageAccount.svg');
                        }

                        const node: StorageAccountTreeItem = {
                            label: acc.account.name,
                            contextValue: isAttached ? 'storageAccount-attached' : 'storageAccount-detached',
                            iconPath,
                            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                            storageAccountId: acc.account.id,
                            storageConnString,
                            hubNames: acc.hubNames,
                            description: `${acc.hubNames.length} Task Hub${acc.hubNames.length === 1 ? '' : 's'}`,
                            tooltip: !acc.storageKey ? 'identity-based' : ConnStringUtils.MaskStorageConnString(storageConnString)
                        };
                        
                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);
                    }
                    
                    break;

                case 'storageAccount-attached':
                case 'storageAccount-detached':
                case 'storedStorageAccount-attached':
                case 'storedStorageAccount-detached':

                    const accountNode = parent as StorageAccountTreeItem;

                    if (!accountNode.hubNames || !accountNode.hubNames.length) {

                        result.push({
                            label: 'No Task Hubs found'
                        });
                        
                    } else {

                        for (const hub of accountNode.hubNames) {

                            const storageConnectionSettings = new StorageConnectionSettings(accountNode.storageConnString, hub);
                            const isVisible = this._monitorViews.isMonitorViewVisible(storageConnectionSettings);
    
                            const node: TaskHubTreeItem = {
                                label: hub,
                                contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                                iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                                storageAccountId: accountNode.storageAccountId,
                                storageConnectionSettings,
                            };
    
                            node.command = {
                                title: 'Attach',
                                command: 'durableFunctionsMonitorTreeView.attachToTaskHub',
                                arguments: [node]
                            };
                            
                            // Sorting by name on the fly
                            const index = result.findIndex(n => n.label! > node.label!);
                            result.splice(index < 0 ? result.length : index, 0, node);
                        }    
                    }

                    break;
                
                case 'localProject':

                    const storageConnectionSettings = this._monitorViews.getStorageConnectionSettingsFromCurrentProject('TestHubName');

                    if (!!storageConnectionSettings) {
                        
                        const isVisible = this._monitorViews.isMonitorViewVisible(storageConnectionSettings);

                        const node: TaskHubTreeItem = {
                            label: storageConnectionSettings.hubName,
                            contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                            iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                            storageConnectionSettings: storageConnectionSettings
                        };
    
                        node.command = {
                            title: 'Attach',
                            command: 'durableFunctionsMonitorTreeView.attachToTaskHub',
                            arguments: [node]
                        };
    
                        result.push(node);
                    }
                        
                    break;
                
                case 'connectionStrings':

                    const connStrings = await this._monitorViews.getPersistedConnStrings();
                    
                    for (const connString of connStrings) {
                        
                        const isAttached = this._monitorViews.isBackendAttached(connString)

                        let hubNames: string[] | null = null;
                        let iconPath: string = '';
                        let tooltip: string = '';
                        let description: string = '';

                        try {
                            
                            if (ConnStringUtils.GetSqlServerName(connString)) {

                                iconPath = path.join(this._resourcesFolderPath, isAttached ? 'mssqlAttached.svg' : 'mssql.svg');
                                tooltip = 'MSSQL Storage Provider';
                                description = 'MSSQL Storage Provider';

                                const connStringData = this._monitorViews.getPersistedConnStringData(connString);
                                if (!!connStringData) {

                                    hubNames = connStringData.taskHubs ?? [];
                                    if (!hubNames.length) {
                                        hubNames = ['dt/dbo'];
                                    }
                                }
                                
                            } else {

                                iconPath = path.join(this._resourcesFolderPath, isAttached ? 'storageAccountAttached.svg' : 'storageAccount.svg');
                                tooltip = ConnStringUtils.MaskStorageConnString(connString);

                                const tableEndpoint = ConnStringUtils.GetTableEndpoint(connString);
                                const accountName = ConnStringUtils.GetAccountName(connString);
                                const accountKey = ConnStringUtils.GetAccountKey(connString);

                                hubNames = await getTaskHubNamesFromTableStorage(tableEndpoint, accountName, accountKey);
                            }

                            if (!!hubNames) {
                                    
                                description = `${hubNames.length} Task Hub${hubNames.length === 1 ? '' : 's'}`;
                            }

                        } catch (err: any) {

                            description = `Failed to load Task Hubs`;
                            tooltip = err.message ?? err;
                            this._log(`Failed to load Task Hubs from ${ConnStringUtils.GetStorageName(connString)}. ${err.message ?? err}\n`);
                        }

                        const node: StorageAccountTreeItem = {
                            label: ConnStringUtils.GetStorageName(connString),
                            contextValue: isAttached ? 'storedStorageAccount-attached' : 'storedStorageAccount-detached',
                            iconPath,
                            collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                            storageConnString: connString,
                            hubNames: hubNames ?? [],
                            description,
                            tooltip
                        };
                        
                        // Sorting by name on the fly
                        const index = result.findIndex(n => n.label! > node.label!);
                        result.splice(index < 0 ? result.length : index, 0, node);                                
                    }

                    if (!connStrings.length) {
                        
                        result.push({
                            label: 'Attach to Task Hub...',

                            command: {
                                title: 'Attach to Task Hub...',
                                command: 'durableFunctionsMonitorTreeView.attachToAnotherTaskHub'
                            }
                        });
                    }

                    break;
                
                case 'storageEmulator':
                    
                    const emulatorConnString = Settings().storageEmulatorConnectionString;

                    const accountName = ConnStringUtils.GetAccountName(emulatorConnString);
                    const accountKey = ConnStringUtils.GetAccountKey(emulatorConnString);
                    const tableEndpoint = ConnStringUtils.GetTableEndpoint(emulatorConnString);

                    let hubNames: string[] | null = null;
            
                    try {

                        hubNames = await getTaskHubNamesFromTableStorage(tableEndpoint, accountName, accountKey) ?? [];
                        
                    } catch (err: any) {
                        
                        result.push({
                            label: `Failed to load Task Hubs. ${err.message ?? err}`
                        });
                    }

                    if (!!hubNames) {

                        if (!hubNames.length) {

                            result.push({
                                label: 'No Task Hubs found'
                            });
                                
                        } else {

                            for (const hub of hubNames) {

                                const storageConnectionSettings = new StorageConnectionSettings(emulatorConnString, hub);
                                const isVisible = this._monitorViews.isMonitorViewVisible(storageConnectionSettings);
        
                                const node: TaskHubTreeItem = {
                                    label: hub,
                                    contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                                    iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                                    storageConnectionSettings,
                                };
        
                                node.command = {
                                    title: 'Attach',
                                    command: 'durableFunctionsMonitorTreeView.attachToTaskHub',
                                    arguments: [node]
                                };
                                
                                // Sorting by name on the fly
                                const index = result.findIndex(n => n.label! > node.label!);
                                result.splice(index < 0 ? result.length : index, 0, node);
                            }
                        }                    
                    }

                    break;
            }

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to load tree items. ${err.message ?? err}`);
        }

        return result;
    }

    // Handles 'Attach' context menu item or a click on a tree node
    attachToTaskHub(taskHubItem: TaskHubTreeItem, messageToWebView: any = undefined): void {

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }

        this._inProgress = true;
        const monitorView = this._monitorViews.getOrCreateFromStorageConnectionSettings(taskHubItem.storageConnectionSettings);

        monitorView.show(messageToWebView).then(() => {

            this._onDidChangeTreeData.fire(undefined);
            this._inProgress = false;

        }, (err: any) => {
            // .finally() doesn't work here - vscode.window.showErrorMessage() blocks it until user 
            // closes the error message. As a result, _inProgress remains true until then, which blocks all commands

            this._inProgress = false;
            vscode.window.showErrorMessage(!err.message ? err : err.message);
        });
    }

    // Triggers when F5 is being hit
    handleOnDebugSessionStarted() {

        if (!!this._monitorViews.isAnyMonitorViewVisible()) {
            return;
        }

        const DfmDoNotAskUponDebugSession = 'DfmDoNotAskUponDebugSession';
        const doNotAsk = this._context.globalState.get(DfmDoNotAskUponDebugSession, false);

        if (!Settings().showWhenDebugSessionStarts && !!doNotAsk) {
            return;
        }

        const defaultTaskHubName = 'TestHubName';
        const curConnSettings = this._monitorViews.getStorageConnectionSettingsFromCurrentProject(defaultTaskHubName);
        if (!curConnSettings) {
            return;
        }

        if (!Settings().showWhenDebugSessionStarts) {

            const prompt = `Do you want Durable Functions Monitor to be automatically shown when you start debugging a Durable Functions project? You can always change this preference via Settings.`;
            vscode.window.showWarningMessage(prompt, `Yes`, `No, and don't ask again`).then(answer => {
    
                if (answer === `No, and don't ask again`) {

                    UpdateSetting('showWhenDebugSessionStarts', false);
                    this._context.globalState.update(DfmDoNotAskUponDebugSession, true);

                } else if (answer === `Yes`) {
                    
                    UpdateSetting('showWhenDebugSessionStarts', true);

                    this.showUponDebugSession(
                        curConnSettings.hubName !== defaultTaskHubName ? curConnSettings : undefined
                    );
                }
            });

        } else {

            this.showUponDebugSession(
                curConnSettings.hubName !== defaultTaskHubName ? curConnSettings : undefined
            );
        }
    }

    // Handles 'Forget this Connection String' context menu item
    forgetConnectionString(storageAccountItem: StorageAccountTreeItem) {

        if (!storageAccountItem) {
            vscode.window.showWarningMessage('This command is only available via context menu');
            return;
        }

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }
        this._inProgress = true;

        this._monitorViews.detachBackends(storageAccountItem.storageConnString)
            .then(() => this._monitorViews.forgetConnectionString(storageAccountItem.storageConnString))
            .then(() => {

                this._onDidChangeTreeData.fire(undefined);
                this._inProgress = false;

            }, err => {
                this._inProgress = false;
                vscode.window.showErrorMessage(`Failed to detach from Task Hub. ${err}`);
            });
    }

    // Handles 'Detach' context menu item
    detachFromTaskHub(storageAccountItem: StorageAccountTreeItem) {

        if (!storageAccountItem) {
            vscode.window.showWarningMessage('This command is only available via context menu');
            return;
        }

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }
        this._inProgress = true;

        this._monitorViews.detachBackends(storageAccountItem.storageConnString).then(() => {

            this._onDidChangeTreeData.fire(undefined);
            this._inProgress = false;

        }, err => {
            this._inProgress = false;
            vscode.window.showErrorMessage(`Failed to detach from Task Hub. ${err}`);
        });
    }

    // Handles 'Delete Task Hub' context menu item
    deleteTaskHub(taskHubItem: TaskHubTreeItem) {

        if (!taskHubItem) {
            vscode.window.showWarningMessage('This command is only available via context menu');
            return;
        }

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }

        if (!!taskHubItem.storageConnectionSettings.isMsSql) {
            vscode.window.showErrorMessage('Deleting Task Hubs is not supported for MSSQL Durability Provider');
            return;
        }

        const monitorView = this._monitorViews.getOrCreateFromStorageConnectionSettings(taskHubItem.storageConnectionSettings);
        if (!monitorView) {
            console.log(`Tried to delete a detached Task Hub`);
            return;
        }
        
        const prompt = `This will permanently delete all Azure Storage resources used by '${taskHubItem.label}' orchestration service. There should be no running Function instances for this Task Hub present. Are you sure you want to proceed?`;
        vscode.window.showWarningMessage(prompt, 'Yes', 'No').then(answer => {

            if (answer === 'Yes') {

                this._inProgress = true;
                monitorView.deleteTaskHub().then(() => { 

                    this._storageAccountMap = {};

                    this._onDidChangeTreeData.fire(undefined);
                    this._inProgress = false;

                }, (err) => { 
                    this._inProgress = false;
                    vscode.window.showErrorMessage(`Failed to delete Task Hub. ${err}`);
                });
            }
        });
    }

    // Handles 'Open in Storage Explorer' context menu item
    async openTableInStorageExplorer(taskHubItem: TaskHubTreeItem, table: 'Instances' | 'History') {

        if (!taskHubItem.storageAccountId) {
            return;
        }

        // Extracting subscriptionId
        const match = /\/subscriptions\/([^\/]+)\/resourceGroups/gi.exec(taskHubItem.storageAccountId);
        if (!match || match.length <= 0) {
            return;
        }
        const subscriptionId = match[1];

        // Using Azure Storage extension for this
        var storageExt = vscode.extensions.getExtension('ms-azuretools.vscode-azurestorage');
        if (!storageExt) {
            vscode.window.showErrorMessage(`For this to work, please, install [Azure Storage](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurestorage) extension.`);
            return;
        }

        try {

            if (!storageExt.isActive) {
                await storageExt.activate();
            }

            await vscode.commands.executeCommand('azureStorage.openTable', {

                root: {
                    storageAccountId: taskHubItem.storageAccountId,
                    // This works with older versions of Azure Storage ext
                    subscriptionId: subscriptionId
                },

                subscription: {
                    // This works with newer versions of Azure Storage ext
                    subscriptionId: subscriptionId
                },

                tableName: taskHubItem.label + table
            });

        } catch (err) {
            vscode.window.showErrorMessage(`Failed to execute command. ${err}`);
        }
    }

    // Handles 'Refresh' button
    refresh() {
        this._storageAccountMap = {};
        this._onDidChangeTreeData.fire(undefined);
    }

    // Handles 'Detach from all Task Hubs' button
    detachFromAllTaskHubs() {

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }
        this._inProgress = true;

        this.cleanup().catch(err => {
            vscode.window.showErrorMessage(`Failed to detach from Task Hub. ${err}`);
        }).finally(() => {
            this._onDidChangeTreeData.fire(undefined);
            this._inProgress = false;
        });
    }
    
    // Handles 'Go to instanceId...' context menu item
    gotoInstanceId(taskHubItem: TaskHubTreeItem | null) {

        // Trying to get a running backend instance.
        // If the relevant MonitorView is currently not visible, don't want to show it - that's why all the custom logic here.
        var monitorView = !taskHubItem ?
            this._monitorViews.firstOrDefault() :
            this._monitorViews.getOrCreateFromStorageConnectionSettings(taskHubItem.storageConnectionSettings);

        if (!!monitorView) {

            monitorView.gotoInstanceId();

        } else {

            this.createOrActivateMonitorView(false).then(view => {
                if (!!view) {

                    // Not sure why this timeout here is needed, but without it the quickPick isn't shown
                    setTimeout(() => {
                        view.gotoInstanceId();
                    }, 1000);
                }
            });
        }
    }

    // Stops all backend processes and closes all views
    cleanup(): Promise<any> {
        return this._monitorViews.cleanup();
    }

    private readonly _azureAccount: any;
    private readonly _resourcesFolderPath: string;

    private _inProgress: boolean = false;

    private _monitorViews: MonitorViewList;

    // Caching storage accounts per each subscription
    private _storageAccountMap: { [subscriptionId: string]: StorageAccountAndTaskHubs[] } = {};

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    // Shows or makes active the main view
    async createOrActivateMonitorView(alwaysCreateNew: boolean, messageToWebView: any = undefined): Promise<MonitorView | null> {

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return null;
        }

        try {

            const monitorView = await this._monitorViews.getOrAdd(alwaysCreateNew);

            if (!monitorView) {
                return null;
            }

            this._inProgress = true;

            await monitorView.show(messageToWebView);

            this._inProgress = false;
            this._onDidChangeTreeData.fire(undefined);

            return monitorView;

        } catch (err) {
            
            // .finally() doesn't work here - vscode.window.showErrorMessage() blocks it until user 
            // closes the error message. As a result, _inProgress remains true until then, which blocks all commands
            this._inProgress = false;
            vscode.window.showErrorMessage(!(err as any).message ? err : (err as any).message);

            this._onDidChangeTreeData.fire(undefined);
        }

        return null;
    }

    private async getStorageAccountsAndTaskHubs(subscription: AzureSubscription): Promise<StorageAccountAndTaskHubs[]> {

        // Caching storage accounts, to speed up refresh
        let result = this._storageAccountMap[subscription.subscription.subscriptionId];
        if (!!result) {
            return result;
        }

        result = [];

        const storageManagementClient = new StorageManagementClient(subscription.session.credentials2, subscription!.subscription.subscriptionId);
                    
        const storageAccounts = await this.fetchAllStorageAccounts(storageManagementClient);
          
        await Promise.all(
            storageAccounts.map(async acc => {

                const taskHubsAndStorageKey = await this.getStorageAccountTaskHubsForSubscription(storageManagementClient, acc, subscription);

                if (!!taskHubsAndStorageKey && taskHubsAndStorageKey.hubNames?.length > 0) {

                    result.push({ account: acc, hubNames: taskHubsAndStorageKey.hubNames, storageKey: taskHubsAndStorageKey.storageKey });
                }
            })
        );

        this._storageAccountMap[subscription.subscription.subscriptionId] = result;

        return result;
    }

    // Shows the main view upon a debug session
    private async showUponDebugSession(connSettingsFromCurrentProject?: StorageConnectionSettings): Promise<void> {
        
        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }

        try {

            const monitorView = await this._monitorViews.showUponDebugSession(connSettingsFromCurrentProject);

            if (!monitorView) {
                return;
            }

            this._inProgress = true;
            
            await monitorView.show();

            this._onDidChangeTreeData.fire(undefined);
            this._inProgress = false;
            
        } catch (err) {

            // .finally() doesn't work here - vscode.window.showErrorMessage() blocks it until user 
            // closes the error message. As a result, _inProgress remains true until then, which blocks all commands
            this._inProgress = false;
            vscode.window.showErrorMessage(!(err as any).message ? err : (err as any).message);
        }
    }

    // Tries to map a Storage connection string to some Azure credentials
    private async getTokenCredentialsForGivenConnectionString(connString: string): Promise<AzureConnectionInfo | undefined> {

        const storageAccountName = ConnStringUtils.GetAccountName(connString);
        if (!storageAccountName) {
            return;
        }

        for (const subscription of this._azureAccount.filters) {

            const storageAccounts = await this.getStorageAccountsAndTaskHubs(subscription);

            for (const account of storageAccounts) {
                
                if (account.account.name?.toLowerCase() === storageAccountName.toLowerCase()) {
                 
                    return {
                        credentials: subscription.session.credentials2,
                        subscriptionId: subscription.subscription.subscriptionId,
                        tenantId: subscription.session.tenantId
                    };                                
                }
            }
        }
    }

    private async fetchAllStorageAccounts(storageManagementClient: StorageManagementClient): Promise<StorageAccount[]> {
 
        const result: StorageAccount[] = [];

        var storageAccountsPartialResponse = await storageManagementClient.storageAccounts.list();
        result.push(...storageAccountsPartialResponse);

        while (!!storageAccountsPartialResponse.nextLink) {

            storageAccountsPartialResponse = await storageManagementClient.storageAccounts.listNext(storageAccountsPartialResponse.nextLink);
            result.push(...storageAccountsPartialResponse);
        }

        return result;
    }

    private async getStorageAccountTaskHubsForSubscription(
        storageManagementClient: StorageManagementClient,
        storageAccount: StorageAccount,
        subscription: AzureSubscription
    ): Promise<{ storageKey?: string, hubNames: string[] } | undefined> {

        try {

            let tableEndpoint = '';
            if (!!storageAccount.primaryEndpoints) {
                tableEndpoint = storageAccount.primaryEndpoints.table!;
            }

            switch (Settings().taskHubsDiscoveryMode) {
                case 'Do not use Storage keys':

                    // Only using token
                    const hubNames = await getTaskHubNamesFromTableStorageWithUserToken(tableEndpoint, storageAccount.name!, subscription.session.credentials2);
                    return { hubNames: hubNames ?? [] };
                
                case 'Do not use Azure account':

                    // Only using keys
                    return await this.getTaskHubsViaStorageKeys(storageManagementClient, storageAccount, tableEndpoint);
            }

            // Default mode
            try {

                // First trying with keys
                return await this.getTaskHubsViaStorageKeys(storageManagementClient, storageAccount, tableEndpoint);
                
            } catch (err) {

                // Falling back to token
                const hubNames = await getTaskHubNamesFromTableStorageWithUserToken(tableEndpoint, storageAccount.name!, subscription.session.credentials2);
                return { hubNames: hubNames ?? [] };
            }
            
        } catch (err: any) {

            this._log(`Failed to list Task Hubs for Storage account ${storageAccount.name!}. ${err.message ?? err}\n`);
        }
    }

    private async getTaskHubsViaStorageKeys(
        storageManagementClient: StorageManagementClient,
        storageAccount: StorageAccount,
        tableEndpoint: string
    ): Promise<{storageKey?: string, hubNames: string[]}> {

        // Extracting resource group name
        const match = /\/resourceGroups\/([^\/]+)\/providers/gi.exec(storageAccount.id!);
        if (!match || match.length <= 0) {
            
            throw new Error(`Failed to extract Resource Group name`);
        }
        const resourceGroupName = match[1];

        let storageKeys;
        let storageKey: StorageAccountKey | undefined = undefined;

        storageKeys = await storageManagementClient.storageAccounts.listKeys(resourceGroupName, storageAccount.name!);
        
        // Choosing the key that looks best
        storageKey = storageKeys?.keys?.find(k => !k.permissions || k.permissions.toLowerCase() === "full");
        if (!storageKey) {
            storageKey = storageKeys?.keys?.find(k => !k.permissions || k.permissions.toLowerCase() === "read");
        }

        if (!storageKey || !storageKey.value) {

            throw new Error(`No Storage keys were returned.`);
        }

        const hubNames = await getTaskHubNamesFromTableStorage(tableEndpoint, storageAccount.name!, storageKey.value);

        return { storageKey: storageKey.value, hubNames: hubNames ?? [] };
    }
}

type SubscriptionTreeItem = vscode.TreeItem & {

    azureSubscription?: AzureSubscription,
};

type StorageAccountTreeItem = vscode.TreeItem & {

    storageAccountId?: string,
    storageConnString: string,
    hubNames: string[],
};

type TaskHubTreeItem = vscode.TreeItem & {

    storageAccountId?: string,
    storageConnectionSettings: StorageConnectionSettings,
};

type StorageAccountAndTaskHubs = { account: StorageAccount, storageKey?: string, hubNames: string[] };
