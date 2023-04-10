// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { ConnStringUtils } from "./ConnStringUtils";

import { AzureConnectionInfo, MonitorView } from "./MonitorView";
import { BackendProcess } from './BackendProcess';
import { StorageConnectionSettings } from "./StorageConnectionSettings";
import { FunctionGraphList } from './FunctionGraphList';
import { ConnStringRepository } from './ConnStringRepository';
import { TaskHubsCollector } from './TaskHubsCollector';

type HostJsonInfo = {
    hubName?: string,
    storageProviderType: 'default' | 'mssql' | 'netherite',
    connectionStringName: string,
    schemaName?: string,
    otherConnectionStringName?: string
};

// Represents all MonitorViews created so far
export class MonitorViewList {

    constructor(private _context: vscode.ExtensionContext,
        private _functionGraphList: FunctionGraphList,
        private _connStringRepo: ConnStringRepository,        
        private _getTokenCredentialsForGivenConnectionString: (connString: string) => Promise<AzureConnectionInfo | undefined>,
        private _onViewStatusChanged: () => void,
        private _log: (line: string) => void) {
    }

    isAnyMonitorViewVisible(): boolean {
        return Object.keys(this._monitorViews).some(k => !!this._monitorViews[k] && this._monitorViews[k].isVisible);
    }

    isMonitorViewVisible(connSettings: StorageConnectionSettings): boolean {
        const monitorView = this._monitorViews[connSettings.hashKey];
        return !!monitorView && monitorView.isVisible;
    }

    // Creates a new MonitorView with provided connection settings
    getOrCreateFromStorageConnectionSettings(connSettings: StorageConnectionSettings, projectPath?: string): MonitorView {

        var monitorView = this._monitorViews[connSettings.hashKey];
        if (!!monitorView) {
            return monitorView;
        }

        if (!!vscode.workspace.workspaceFolders && !projectPath) {

            for (const workspaceFolder of vscode.workspace.workspaceFolders) {

                // Using the first Functions project in the workspace for generating Functions graph
                if (fs.existsSync(path.join(workspaceFolder.uri.fsPath, 'host.json'))) {
                
                    projectPath = workspaceFolder.uri.fsPath;
                    break;
                }
            }
        }

        const backendProcess = this.getOrAddBackend(connSettings);

        monitorView = new MonitorView(this._context,
            backendProcess,
            connSettings.hubName,
            this._functionGraphList,
            this._getTokenCredentialsForGivenConnectionString,
            this._onViewStatusChanged,
            this._log,
            projectPath
        );
        
        this._monitorViews[connSettings.hashKey] = monitorView;
        return monitorView;
    }

    // Gets an existing (first in the list) MonitorView,
    // or initializes a new one by asking user for connection settings
    async getOrAdd(alwaysCreateNew: boolean): Promise<MonitorView | null> {

        const keys = Object.keys(this._monitorViews);
        if (!alwaysCreateNew && keys.length > 0) {
            return this._monitorViews[keys[0]];
        }

        const connSettings = await this.askForStorageConnectionSettings();

        if (!connSettings) {
            return null;
        }

        if (!connSettings.connStringHashKey) {
            throw new Error(`The provided Connection String seems to be invalid`);
        }

        // Persisting the provided connection string in ExtensionContext.secrets
        await this._connStringRepo.saveConnectionString(connSettings);

        return await this.getOrCreateFromStorageConnectionSettings(connSettings);
    }

    firstOrDefault(): MonitorView | null {

        const keys = Object.keys(this._monitorViews);
        if (keys.length <= 0) {
            return null;
        }

        return this._monitorViews[keys[0]];
    }

    // Parses local project files and tries to infer connction settings from them
    getStorageConnectionSettingsFromCurrentProject(defaultTaskHubName?: string, projectPath?: string): StorageConnectionSettings | null {

        const hostJson = this.readHostJson(projectPath);
        let hubName = hostJson.hubName;

        if (hostJson.storageProviderType === 'mssql') {
            
            const sqlConnectionString = this.getValueFromLocalSettings(hostJson.connectionStringName, projectPath);
            if (!sqlConnectionString) {
                return null;
            }

            return new StorageConnectionSettings(sqlConnectionString, `${hostJson.schemaName || 'dt'}/${hubName || 'dbo'}`);
        }

        if (!hubName) {

            hubName = defaultTaskHubName;
            if (!hubName) {
                return null;
            }
        }

        if (hostJson.storageProviderType === 'netherite') {
            
            const storageConnString = this.getValueFromLocalSettings(hostJson.connectionStringName, projectPath);
            if (!storageConnString) {
                return null;
            }

            if (!hostJson.otherConnectionStringName) {
                return null;
            }

            const hubsConnString = this.getValueFromLocalSettings(hostJson.otherConnectionStringName, projectPath);
            if (!hubsConnString) {
                return null;
            }
    
            return new StorageConnectionSettings(ConnStringUtils.ExpandEmulatorShortcutIfNeeded(storageConnString), hubName, hubsConnString);
        }

        const storageConnString = this.getValueFromLocalSettings('AzureWebJobsStorage', projectPath);
        if (!storageConnString) {
            return null;
        }

        return new StorageConnectionSettings(ConnStringUtils.ExpandEmulatorShortcutIfNeeded(storageConnString), hubName);
    }

    // Stops all backend processes and closes all views
    cleanup(): Promise<any> {

        Object.keys(this._monitorViews).map(k => this._monitorViews[k].cleanup());
        this._monitorViews = {};

        const backends = this._backends;
        this._backends = {};
        return Promise.all(Object.keys(backends).map(k => backends[k].cleanup()));
    }

    async detachBackends(storageConnString: string): Promise<any> {

        const connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(storageConnString);

        // Closing all views related to this connection
        for (const key of Object.keys(this._monitorViews)) {
            const monitorView = this._monitorViews[key];

            if (monitorView.storageConnectionSettings.connStringHashKey === connStringHashKey) {

                monitorView.cleanup();
                delete this._monitorViews[key];
            }
        }

        // Stopping background process(es) with this conn string

        const backendHashKeys = Object.keys(this._backends);
        for (const backendHashKey of backendHashKeys) {
            
            const backendProcess = this._backends[backendHashKey];

            if (StorageConnectionSettings.GetConnStringHashKey(backendProcess.storageConnectionString) === connStringHashKey) {
                
                await backendProcess.cleanup();

                delete this._backends[backendHashKey];
            }
        }
    }

    async detachBackend(connSettings: StorageConnectionSettings): Promise<any> {

        // Closing all views related to this connection
        for (const key of Object.keys(this._monitorViews)) {
            const monitorView = this._monitorViews[key];

            if (monitorView.storageConnectionSettings.connStringHashKey === connSettings.connStringHashKey) {

                monitorView.cleanup();
                delete this._monitorViews[key];
            }
        }

        // Stopping background process
        const backendProcess = this._backends[connSettings.hashKeyForBackend];
        if (!backendProcess) {
            return;
        }

        await backendProcess.cleanup();

        delete this._backends[connSettings.hashKeyForBackend];
    }

    isBackendAttached(storageConnString: string): boolean {

        for (const backendHashKey in this._backends) {
            
            const backend = this._backends[backendHashKey];

            if (StorageConnectionSettings.GetConnStringHashKey(backend.storageConnectionString) === StorageConnectionSettings.GetConnStringHashKey(storageConnString)
                && !!backend.backendUrl) {
                return true;
            }
        }
        return false;
    }

    showUponDebugSession(connSettingsFromCurrentProject?: StorageConnectionSettings): Promise<MonitorView | null> {

        if (!connSettingsFromCurrentProject) {
            return this.getOrAdd(true);
        }

        return Promise.resolve(this.getOrCreateFromStorageConnectionSettings(connSettingsFromCurrentProject));
    }

    getBackend(connSettings: StorageConnectionSettings): BackendProcess | undefined {
        
        return this._backends[connSettings.hashKeyForBackend];
    }

    private _monitorViews: { [key: string]: MonitorView } = {};
    private _backends: { [key: string]: BackendProcess } = {};

    private getOrAddBackend(connSettings: StorageConnectionSettings): BackendProcess {

        // If a backend for this connection already exists, then just returning the existing one.
        var backendProcess = this._backends[connSettings.hashKeyForBackend];

        if (!backendProcess) {

            backendProcess = new BackendProcess(
                this._context.extensionPath,
                connSettings,
                () => this.detachBackend(connSettings),
                (storageConnString, schemaName, taskHubs) => this._connStringRepo.saveTaskHubs(storageConnString, schemaName, taskHubs),
                this._log
            );

            this._backends[connSettings.hashKeyForBackend] = backendProcess;
        }

        return backendProcess;
    }

    // Obtains Storage Connection String and Hub Name from user
    private askForStorageConnectionSettings(): Promise<StorageConnectionSettings | null> {

        let isMsSql = false;
        let isNetherite = false;

        return new Promise<StorageConnectionSettings | null>((resolve, reject) => {

            // Asking the user for Connection String
            let connStringToShow = '';
            const connStringFromLocalSettings = this.getValueFromLocalSettings('AzureWebJobsStorage');

            if (!!connStringFromLocalSettings) {
                connStringToShow = ConnStringUtils.MaskStorageConnString(connStringFromLocalSettings);
            }

            vscode.window.showInputBox({ value: connStringToShow, prompt: 'Storage or MSSQL Connection String', ignoreFocusOut: true })
                .then(connString => {

                    if (!connString) {
                        resolve(null);
                        return;
                    }

                    // If the user didn't change it
                    if (connString === connStringToShow) {
                        // Then setting it back to non-masked one
                        connString = connStringFromLocalSettings;
                    }

                    // Dealing with 'UseDevelopmentStorage=true' early
                    connString = ConnStringUtils.ExpandEmulatorShortcutIfNeeded(connString);

                    isMsSql = !!ConnStringUtils.GetSqlServerName(connString);

                    const hostJson = this.readHostJson();
                    
                    // Asking the user for Hub Name
                    let hubName = '';
                    const hubPick = vscode.window.createQuickPick();

                    hubPick.ignoreFocusOut = true;

                    hubPick.onDidHide(() => {
                        hubPick.dispose();
                        resolve(null);
                    });

                    hubPick.onDidChangeSelection(items => {
                        if (!!items && !!items.length) {
                            hubName = items[0].label;
                        }
                    });

                    // Still allowing to type free text
                    hubPick.onDidChangeValue(value => {
                        hubName = value;
                    });

                    hubPick.onDidAccept(() => {

                        hubPick.hide();

                        resolve(!!hubName ? new StorageConnectionSettings(connString!, hubName) : null);
                    });
                    
                    hubPick.title = 'Hub Name';

                    if (!!hostJson.hubName) {

                        hubPick.placeholder = hostJson.hubName;

                    } else {

                        hubPick.placeholder = isMsSql ? 'dbo' : 'DurableFunctionsHub';
                    }

                    hubPick.items = [{
                        label: hubPick.placeholder
                    }];

                    if (!isMsSql) {
                        
                        // Loading other hub names directly from Table Storage

                        const taskHubsCollector = new TaskHubsCollector(ConnStringUtils.GetTableEndpoint(connString), ConnStringUtils.GetAccountName(connString));

                        taskHubsCollector.getTaskHubNamesWithKey(ConnStringUtils.GetAccountKey(connString))
                            .then(result => { 

                                isNetherite = result.storageType === 'netherite';

                                if (!!result.hubNames?.length) {

                                    // Adding loaded names to the list
                                    hubPick.items = result.hubNames.map(label => {
                                        return { label: label };
                                    });
    
                                    hubPick.placeholder = result.hubNames[0];
                                }
                            })
                            .catch(err => { 

                                this._log(`Failed to list Task Hubs for Storage account. ${err.message ?? err}\n`);
                            });
                    }

                    hubPick.show();

                }, reject);
            
        }).then(connSettings => {

            if (!connSettings) {
                return connSettings;
            }
            
            if (!!isMsSql) {
                
                return this.askForDbSchemaName(connSettings);
            }

            if (!!isNetherite) {
                
                return this.askForEventHubsConnString(connSettings);
            }

            return connSettings;
        });
    }

    private async askForDbSchemaName(connSettings: StorageConnectionSettings): Promise<StorageConnectionSettings | null> {

        const schemaName = await vscode.window.showInputBox({ title: 'Database Schema Name', value: 'dt', ignoreFocusOut: true });

        if (!schemaName) {

            return null;
        }

        return new StorageConnectionSettings(connSettings.storageConnString, `${schemaName}/${connSettings.hubName}`);
    }

    private async askForEventHubsConnString(connSettings: StorageConnectionSettings): Promise<StorageConnectionSettings | null> {

        const eventHubsConnString = await vscode.window.showInputBox({ prompt: 'Event Hubs Connection String', ignoreFocusOut: true });

        if (!eventHubsConnString) {

            return null;
        }

        return new StorageConnectionSettings(connSettings.storageConnString, connSettings.hubName, eventHubsConnString);
    }

    private getValueFromLocalSettings(valueName: string, projectPath?: string): string {

        try {

            if (!projectPath) {
                projectPath = vscode.workspace.rootPath;
            }
        
            if (!!projectPath && fs.existsSync(path.join(projectPath, 'local.settings.json'))) {
    
                const localSettings = JSON.parse(fs.readFileSync(path.join(projectPath, 'local.settings.json'), 'utf8'));
    
                if (!!localSettings.Values && !!localSettings.Values[valueName]) {
                    return localSettings.Values[valueName];
                }
            }
                
        } catch (err) {

            this._log(`Failed to parse local.settings.json: ${!(err as any).message ? err : (err as any).message}\n`);
        }

        return '';
    }

    private readHostJson(projectPath?: string): HostJsonInfo {

        const result: HostJsonInfo = {
            hubName: '',
            storageProviderType: 'default',
            connectionStringName: '',
            otherConnectionStringName: undefined,
            schemaName: undefined
        };

        if (!projectPath) {
            projectPath = vscode.workspace.rootPath;
        }

        if (!!projectPath && fs.existsSync(path.join(projectPath, 'host.json'))) {

            var hostJson;
            try {

                hostJson = JSON.parse(fs.readFileSync(path.join(projectPath, 'host.json'), 'utf8'));
                
            } catch (err) {

                this._log(`Failed to parse host.json: ${!(err as any).message ? err : (err as any).message}\n`);
                return result;
            }

            if (!!hostJson && !!hostJson.extensions && hostJson.extensions.durableTask) {

                const durableTask = hostJson.extensions.durableTask;
                if (!!durableTask.HubName || !!durableTask.hubName) {
                    result.hubName = !!durableTask.HubName ? durableTask.HubName : durableTask.hubName
                }

                if (!!durableTask.storageProvider) {

                    switch (durableTask.storageProvider.type?.toLowerCase()) {
                        case 'mssql':
                            result.storageProviderType = 'mssql';
                            result.connectionStringName = durableTask.storageProvider.connectionStringName;
                            result.schemaName = durableTask.storageProvider.schemaName;
                        break;
                        case 'netherite':
                            result.storageProviderType = 'netherite';
                            result.connectionStringName = durableTask.storageProvider.StorageConnectionName || 'AzureWebJobsStorage';
                            result.otherConnectionStringName = durableTask.storageProvider.EventHubsConnectionName || 'EventHubsConnection';
                        break;
                    }
                }
            }
        }
        return result;
    }
}