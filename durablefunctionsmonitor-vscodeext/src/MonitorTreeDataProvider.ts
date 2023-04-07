// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';
import { StorageManagementClient } from '@azure/arm-storage';
import { StorageAccount, StorageAccountKey } from '@azure/arm-storage/src/models';

import { AzureConnectionInfo, MonitorView } from './MonitorView';
import { MonitorViewList } from './MonitorViewList';
import { FunctionGraphList } from './FunctionGraphList';
import { Settings, UpdateSetting } from './Settings';
import { StorageConnectionSettings } from './StorageConnectionSettings';
import { ConnStringUtils } from './ConnStringUtils';
import { ConnStringRepository } from './ConnStringRepository';
import { StorageType, TaskHubsCollector } from './TaskHubsCollector';
import { AzureSubscription, EventHubPicker } from './EventHubPicker';

// Root object in the hierarchy. Also serves data for the TreeView.
export class MonitorTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> { 

    constructor(private _context: vscode.ExtensionContext, functionGraphList: FunctionGraphList, logChannel?: vscode.OutputChannel) {

        this._log = !logChannel ? () => { } : (l) => logChannel.append(l);

        // Using Azure Account extension to connect to Azure, get subscriptions etc.
        const azureAccountExtension = vscode.extensions.getExtension('ms-vscode.azure-account');

        // Typings for azureAccount are here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
        this._azureAccount = !!azureAccountExtension ? azureAccountExtension.exports : undefined;

        this._connStringRepo = new ConnStringRepository(this._context);

        this._monitorViews = new MonitorViewList(this._context,
            functionGraphList,
            this._connStringRepo,
            (connString) => this.getTokenCredentialsForGivenConnectionString(connString),
            () => this._onDidChangeTreeData.fire(undefined),
            this._log);

        this._resourcesFolderPath = this._context.asAbsolutePath('resources');
        
        if (!!this._azureAccount) {

            // When user changes their list of filtered subscriptions (or just relogins to Azure)...

            if (!!this._azureAccount.onStatusChanged) {
                
                this._context.subscriptions.push(this._azureAccount.onStatusChanged(() => this.refresh()));
            }

            if (!!this._azureAccount.onFiltersChanged) {
                
                this._context.subscriptions.push(this._azureAccount.onFiltersChanged(() => this.refresh()));
            }

            if (!!this._azureAccount.onSessionsChanged) {
                
                this._context.subscriptions.push(this._azureAccount.onSessionsChanged(() => this.refresh()));
            }

            if (!!this._azureAccount.onSubscriptionsChanged) {
                
                this._context.subscriptions.push(this._azureAccount.onSubscriptionsChanged(() => this.refresh()));
            }
        }

        this._eventHubPicker = new EventHubPicker(this._log);
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

                    const storageAccountsAndTaskHubs = await this.getStorageAccountsAndTaskHubs(subscriptionsNode.azureSubscription);

                    for (const acc of storageAccountsAndTaskHubs) {

                        const storageConnString = ConnStringUtils.getConnectionStringForStorageAccount(acc.account, acc.storageKey);

                        const isAttached = this._monitorViews.isBackendAttached(storageConnString);

                        let iconPath = '';
                        if (acc.storageType == 'netherite') {
                            iconPath = path.join(this._resourcesFolderPath, isAttached ? 'netheriteAttached.svg' : 'netherite.svg');
                        } else if (acc.account.kind == 'StorageV2') {
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
                            azureSubscription: subscriptionsNode.azureSubscription,
                            storageType: acc.storageType,
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

                            const isVisible = this._monitorViews.isMonitorViewVisible(new StorageConnectionSettings(accountNode.storageConnString, hub));
    
                            const node: TaskHubTreeItem = {
                                label: hub,
                                contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                                iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                                storageAccountId: accountNode.storageAccountId,
                                storageConnString: accountNode.storageConnString,
                                hubName: hub,
                                storageType: accountNode.storageType,
                                azureSubscription: accountNode.azureSubscription,
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
                        
                        // Creating a watcher to refresh the tree once host.json file changes
                        this.monitorHostJson();

                        const isVisible = this._monitorViews.isMonitorViewVisible(storageConnectionSettings);

                        const node: TaskHubTreeItem = {
                            label: storageConnectionSettings.hubName,
                            contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                            iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                            storageConnString: storageConnectionSettings.storageConnString,
                            eventHubsConnStringFromCurrentProject: storageConnectionSettings.eventHubsConnString,
                            hubName: storageConnectionSettings.hubName,
                            storageType: storageConnectionSettings.isNetherite ? 'netherite' : 'default'
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

                    const connStrings = await this._connStringRepo.getPersistedConnStrings();
                    
                    for (const connString of connStrings) {
                        
                        const isAttached = this._monitorViews.isBackendAttached(connString)

                        let hubNames: string[] | undefined = undefined;
                        let iconPath: string = '';
                        let tooltip: string = '';
                        let description: string = '';
                        let storageType: StorageType = 'default';

                        try {

                            const eventHubsConnString = await this._connStringRepo.getEventHubsConnString(connString);
                            
                            if (!!eventHubsConnString) {

                                // This looks like Netherite

                                storageType = 'netherite';
                                iconPath = path.join(this._resourcesFolderPath, isAttached ? 'netheriteAttached.svg' : 'netherite.svg');
                                tooltip = 'Netherite Storage Provider';
                                description = 'Netherite Storage Provider';

                                const taskHubsCollector = new TaskHubsCollector(ConnStringUtils.GetTableEndpoint(connString), ConnStringUtils.GetAccountName(connString));

                                hubNames = await taskHubsCollector.getTaskHubNamesFromNetheriteStorageWithKey(ConnStringUtils.GetAccountKey(connString));

                            } else if (ConnStringUtils.GetSqlServerName(connString)) {

                                // This looks like MSSQL

                                iconPath = path.join(this._resourcesFolderPath, isAttached ? 'mssqlAttached.svg' : 'mssql.svg');
                                tooltip = 'MSSQL Storage Provider';
                                description = 'MSSQL Storage Provider';

                                const connStringData = this._connStringRepo.getPersistedConnStringData(connString);
                                if (!!connStringData) {

                                    hubNames = connStringData.taskHubs ?? [];
                                    if (!hubNames.length) {
                                        hubNames = ['dt/dbo'];
                                    }
                                }
                                
                            } else {

                                // Just regular storage

                                iconPath = path.join(this._resourcesFolderPath, isAttached ? 'storageAccountAttached.svg' : 'storageAccount.svg');
                                tooltip = ConnStringUtils.MaskStorageConnString(connString);

                                const taskHubsCollector = new TaskHubsCollector(ConnStringUtils.GetTableEndpoint(connString), ConnStringUtils.GetAccountName(connString));

                                hubNames = await taskHubsCollector.getTaskHubNamesFromTableStorageWithKey(ConnStringUtils.GetAccountKey(connString));
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
                            storageType,
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
                    const taskHubsCollector = new TaskHubsCollector(ConnStringUtils.GetTableEndpoint(emulatorConnString), ConnStringUtils.GetAccountName(emulatorConnString));

                    try {

                        const taskHubs = await taskHubsCollector.getTaskHubNamesWithKey(ConnStringUtils.GetAccountKey(emulatorConnString)) ?? [];

                        if (!!taskHubs.hubNames) {

                            if (!taskHubs.hubNames.length) {
    
                                result.push({
                                    label: 'No Task Hubs found'
                                });
                                    
                            } else {
    
                                for (const hub of taskHubs.hubNames) {
    
                                    const isVisible = this._monitorViews.isMonitorViewVisible(new StorageConnectionSettings(emulatorConnString, hub));
            
                                    const node: TaskHubTreeItem = {
                                        label: hub,
                                        contextValue: isVisible ? 'taskHub-attached' : 'taskHub-detached',
                                        iconPath: path.join(this._resourcesFolderPath, isVisible ? 'taskHubAttached.svg' : 'taskHub.svg'),
                                        storageConnString: emulatorConnString,
                                        hubName: hub,
                                        storageType: taskHubs.storageType
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

                    } catch (err: any) {
                        
                        result.push({
                            label: `Failed to load Task Hubs. ${err.message ?? err}`
                        });
                    }

                    break;
            }

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to load tree items. ${err.message ?? err}`);
        }

        return result;
    }

    // Handles 'Attach' context menu item or a click on a tree node
    async attachToTaskHub(taskHubItem: TaskHubTreeItem, messageToWebView: any = undefined): Promise<void> {

        if (!!this._inProgress) {
            console.log(`Another operation already in progress...`);
            return;
        }

        try {

            const connSettings = await this.getConnSettingsForTaskHub(taskHubItem);
            if (!connSettings) {
                return;
            }
    
            const monitorView = this._monitorViews.getOrCreateFromStorageConnectionSettings(connSettings);
    
            this._inProgress = true;
    
            await monitorView.show(messageToWebView);
    
            this._onDidChangeTreeData.fire(undefined);
                
        } catch (err: any) {
            
            vscode.window.showErrorMessage(err.message ?? err);
        }

        this._inProgress = false;
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
            .then(() => this._connStringRepo.forgetConnectionString(storageAccountItem.storageConnString))
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

        if (taskHubItem.storageType === 'netherite') {
            vscode.window.showErrorMessage('Deleting Task Hubs is not supported for Netherite Durability Provider');
            return;
        }

        const connSettings = new StorageConnectionSettings(taskHubItem.storageConnString, taskHubItem.hubName);

        if (!!connSettings.isMsSql) {
            vscode.window.showErrorMessage('Deleting Task Hubs is not supported for MSSQL Durability Provider');
            return;
        }

        const monitorView = this._monitorViews.getOrCreateFromStorageConnectionSettings(connSettings);
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
    async gotoInstanceId(taskHubItem: TaskHubTreeItem | null): Promise<void> {

        let monitorView: MonitorView | null;

        // Trying to get a running backend instance.
        // If the relevant MonitorView is currently not visible, don't want to show it - that's why all the custom logic here.
        if (!taskHubItem) {

            monitorView = this._monitorViews.firstOrDefault();
            
        } else {

            const connSettings = await this.getConnSettingsForTaskHub(taskHubItem);

            if (!connSettings) {
                return;
            }

            monitorView = this._monitorViews.getOrCreateFromStorageConnectionSettings(connSettings);
        }

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

    private readonly _log: (line: string) => void;

    private readonly _connStringRepo: ConnStringRepository;

    private readonly _azureAccount: any;
    private readonly _resourcesFolderPath: string;

    private readonly _eventHubPicker;

    private _inProgress: boolean = false;

    private _monitorViews: MonitorViewList;

    // Caching storage accounts per each subscription
    private _storageAccountMap: { [subscriptionId: string]: StorageAccountAndTaskHubs[] } = {};

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined> = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;

    private _hostJsonWatcher?: vscode.FileSystemWatcher;

    // Refreshes TreeView when host.json file changes
    private monitorHostJson(): void {

        if (!vscode.workspace.rootPath || !!this._hostJsonWatcher) {
            return;
        }

        this._hostJsonWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.workspace.rootPath, 'host.json'));

        this._hostJsonWatcher.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
        this._hostJsonWatcher.onDidCreate(() => this._onDidChangeTreeData.fire(undefined));
        this._hostJsonWatcher.onDidDelete(() => this._onDidChangeTreeData.fire(undefined));

        this._context.subscriptions.push(this._hostJsonWatcher);
    }

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

                    result.push({
                        account: acc,
                        hubNames: taskHubsAndStorageKey.hubNames,
                        storageKey: taskHubsAndStorageKey.storageKey,
                        storageType: taskHubsAndStorageKey.storageType
                    });
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
    ): Promise<{ storageKey?: string, hubNames: string[], storageType: StorageType } | undefined> {

        try {

            let tableEndpoint = '';
            if (!!storageAccount.primaryEndpoints) {
                tableEndpoint = storageAccount.primaryEndpoints.table!;
            }

            const taskHubsCollector = new TaskHubsCollector(tableEndpoint, storageAccount.name!);

            switch (Settings().taskHubsDiscoveryMode) {
                case 'Do not use Storage keys':

                    // Only using token
                    return await taskHubsCollector.getTaskHubNamesWithUserToken(subscription.session.credentials2);
                
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
                return await taskHubsCollector.getTaskHubNamesWithUserToken(subscription.session.credentials2);
            }
            
        } catch (err: any) {

            this._log(`Failed to list Task Hubs for Storage account ${storageAccount.name!}. ${err.message ?? err}\n`);
        }
    }

    private async getTaskHubsViaStorageKeys(
        storageManagementClient: StorageManagementClient,
        storageAccount: StorageAccount,
        tableEndpoint: string
    ): Promise<{storageKey?: string, hubNames: string[], storageType: StorageType }> {

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

        const taskHubsCollector = new TaskHubsCollector(tableEndpoint, storageAccount.name!);

        const hubNames = await taskHubsCollector.getTaskHubNamesWithKey(storageKey.value);

        return { storageKey: storageKey.value, ...hubNames };        
    }

    private async getConnSettingsForTaskHub(treeItem: TaskHubTreeItem): Promise<StorageConnectionSettings | undefined> {

        if (treeItem.storageType !== 'netherite') {
            
            return new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName);
        }

        // The user might already have selected an Event Hub
        const backend = this._monitorViews.getBackend(new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName));
        if (!!backend) {
            
            return new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName, backend.storageConnectionSettings.eventHubsConnString);
        }

        // If this Task Hub was inferred from current project
        if (!!treeItem.eventHubsConnStringFromCurrentProject) {
            
            return new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName, treeItem.eventHubsConnStringFromCurrentProject);
        }

        // Trying to get a stored Event Hubs conn string, in a hope that it was persisted for this storage account previously
        let eventHubsConnString = await this._connStringRepo.getEventHubsConnString(treeItem.storageConnString);

        if (!!eventHubsConnString) {
            
            return new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName, eventHubsConnString);
        }

        const doingListKeysIsNotAllowed = Settings().taskHubsDiscoveryMode == 'Do not use Storage keys';

        // If it is an auto-discovered Task Hub, then just asking user to pick an Event Hub
        if (!!treeItem.azureSubscription && !doingListKeysIsNotAllowed) {
            
            eventHubsConnString = await this._eventHubPicker.pickEventHubConnectionString(treeItem.azureSubscription);

            return !eventHubsConnString ? undefined : new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName, eventHubsConnString);
        }

        // Asking a direct question
        eventHubsConnString = await vscode.window.showInputBox({ prompt: 'Event Hubs Connection String', ignoreFocusOut: true });

        if (!eventHubsConnString) {

            return;
        }

        const connSettings = new StorageConnectionSettings(treeItem.storageConnString, treeItem.hubName, eventHubsConnString);

        // Need to persist this combination of connection strings to VsCode Secret Storage,
        // so that Event Hubs conn string can be managed (updated/deleted)
        await this._connStringRepo.saveConnectionString(connSettings);

        return connSettings;
    }
}

type SubscriptionTreeItem = vscode.TreeItem & {

    azureSubscription: AzureSubscription,
};

type StorageAccountTreeItem = vscode.TreeItem & {

    storageAccountId?: string,
    storageConnString: string,
    hubNames: string[],
    storageType: StorageType;
    azureSubscription?: AzureSubscription;
};

type TaskHubTreeItem = vscode.TreeItem & {

    storageAccountId?: string,
    storageConnString: string,
    eventHubsConnStringFromCurrentProject?: string,
    hubName: string,
    storageType: StorageType;
    azureSubscription?: AzureSubscription;
};

type StorageAccountAndTaskHubs = { account: StorageAccount, storageKey?: string, hubNames: string[], storageType: StorageType };
