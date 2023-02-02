// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

import { ConnStringUtils } from "./ConnStringUtils";

import { AzureConnectionInfo, MonitorView } from "./MonitorView";
import { BackendProcess } from './BackendProcess';
import { StorageConnectionSettings, CreateAuthHeadersForTableStorage, CreateIdentityBasedAuthHeadersForTableStorage } from "./StorageConnectionSettings";
import { FunctionGraphList } from './FunctionGraphList';
import { DeviceTokenCredentials } from '@azure/ms-rest-nodeauth';

type PersistedConnStringHashes = {
    [hash: string]: {
        taskHubNames?: string[]
    }
};

// Represents all MonitorViews created so far
export class MonitorViewList {

    public static readonly ConnectionStringHashes = 'ConnectionStringHashes';

    constructor(private _context: vscode.ExtensionContext,
        private _functionGraphList: FunctionGraphList,
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
    getOrCreateFromStorageConnectionSettings(connSettings: StorageConnectionSettings): MonitorView {

        var monitorView = this._monitorViews[connSettings.hashKey];
        if (!!monitorView) {
            return monitorView;
        }

        const backendProcess = this.getOrAddBackend(connSettings);

        monitorView = new MonitorView(this._context,
            backendProcess,
            connSettings.hubName,
            this._functionGraphList,
            this._getTokenCredentialsForGivenConnectionString,
            this._onViewStatusChanged,
            (storageConnString, taskHubs) => this.saveTaskHubs(storageConnString, taskHubs),
            this._log);
        
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
            throw new Error(`The provided Connection String seem to be invalid`);
        }

        // Persisting the provided connection string in ExtensionContext.secrets
        await this.saveConnectionString(connSettings);

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
    getStorageConnectionSettingsFromCurrentProject(defaultTaskHubName?: string): StorageConnectionSettings | null {

        const hostJson = this.readHostJson();
        let hubName = hostJson.hubName;

        if (hostJson.storageProviderType === 'mssql') {
            
            const sqlConnectionString = this.getValueFromLocalSettings(hostJson.connectionStringName);
            if (!sqlConnectionString) {
                return null;
            }

            return new StorageConnectionSettings(sqlConnectionString, hubName || 'TestHubName');
        }

        if (!hubName) {

            hubName = defaultTaskHubName;
            if (!hubName) {
                return null;
            }
        }

        const storageConnString = this.getValueFromLocalSettings('AzureWebJobsStorage');
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

    async forgetConnectionString(storageConnString: string): Promise<any> {

        const connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(storageConnString);

        this._context.secrets.delete(connStringHashKey);

        let connStringHashes = this.getConnStringHashes();
        if (!connStringHashes) {
            return;
        }

        delete connStringHashes[connStringHashKey];

        await this.saveConnStringHashes(connStringHashes);
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

    async getPersistedConnStrings(): Promise<string[]> {

        const connStringHashes = this.getConnStringHashes();
        if (!connStringHashes) {
            return [];
        }

        const result: string[] = [];

        for (const connStringHash in connStringHashes) {

            const connString = await this._context.secrets.get(connStringHash);

            if (!!connString) {
                
                result.push(connString);
            }
        }

        return result;
    }

    getPersistedTaskHubNames(connString: string): string[] {

        const connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            return [];
        }

        const connStringInfo = connStringMap[StorageConnectionSettings.GetConnStringHashKey(connString)];
        if (!connStringInfo) {
            return [];
        }

        return connStringInfo.taskHubNames ?? [];
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
                this._log
            );

            this._backends[connSettings.hashKeyForBackend] = backendProcess;
        }

        return backendProcess;
    }

    // Obtains Storage Connection String and Hub Name from user
    private askForStorageConnectionSettings(): Promise<StorageConnectionSettings | null> {

        return new Promise<StorageConnectionSettings | null>((resolve, reject) => {

            // Asking the user for Connection String
            var connStringToShow = '';
            const connStringFromLocalSettings = this.getValueFromLocalSettings('AzureWebJobsStorage');

            if (!!connStringFromLocalSettings) {
                connStringToShow = ConnStringUtils.MaskStorageConnString(connStringFromLocalSettings);
            }

            vscode.window.showInputBox({ value: connStringToShow, prompt: 'Storage or MSSQL Connection String' }).then(connString => {

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

                const isMsSql = !!ConnStringUtils.GetSqlServerName(connString);

                // Asking the user for Hub Name
                var hubName = '';
                const hubPick = vscode.window.createQuickPick();

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
                    resolve(!hubName ? null : new StorageConnectionSettings(connString!, hubName));
                });
                
                hubPick.title = 'Hub Name';

                var hubNameFromHostJson = this.readHostJson().hubName;
                if (!!hubNameFromHostJson) {

                    hubPick.placeholder = hubNameFromHostJson;

                } else {

                    hubPick.placeholder = isMsSql ? 'dbo' : 'DurableFunctionsHub';
                }

                hubPick.items = [{
                    label: hubPick.placeholder
                }];

                if (!isMsSql) {
                    
                    // Loading other hub names directly from Table Storage

                    const accountName = ConnStringUtils.GetAccountName(connString);
                    const accountKey = ConnStringUtils.GetAccountKey(connString);
                    const tableEndpoint = ConnStringUtils.GetTableEndpoint(connString);
            
                    getTaskHubNamesFromTableStorage(tableEndpoint, accountName, accountKey).then(hubNames => {

                        if (!!hubNames?.length) {

                            // Adding loaded names to the list
                            hubPick.items = hubNames.map(label => {
                                return { label: label };
                            });

                            hubPick.placeholder = hubNames[0];
                        }

                    }).catch(err => {

                        this._log(`Failed to list Task Hubs for Storage account ${accountName}. ${err.message ?? err}\n`);
                    });
                }

                hubPick.show();

            }, reject);
        });
    }

    private getValueFromLocalSettings(valueName: string): string {

        try {
        
            const ws = vscode.workspace;
            if (!!ws.rootPath && fs.existsSync(path.join(ws.rootPath, 'local.settings.json'))) {
    
                const localSettings = JSON.parse(fs.readFileSync(path.join(ws.rootPath, 'local.settings.json'), 'utf8'));
    
                if (!!localSettings.Values && !!localSettings.Values[valueName]) {
                    return localSettings.Values[valueName];
                }
            }
                
        } catch (err) {

            this._log(`Failed to parse local.settings.json: ${!(err as any).message ? err : (err as any).message}\n`);
        }

        return '';
    }

    private readHostJson(): { hubName?: string, storageProviderType: 'default' | 'mssql', connectionStringName: string } {

        const result = { hubName: '', storageProviderType: 'default' as any, connectionStringName: '' };

        const ws = vscode.workspace;
        if (!!ws.rootPath && fs.existsSync(path.join(ws.rootPath, 'host.json'))) {

            var hostJson;
            try {

                hostJson = JSON.parse(fs.readFileSync(path.join(ws.rootPath, 'host.json'), 'utf8'));
                
            } catch (err) {

                this._log(`Failed to parse host.json: ${!(err as any).message ? err : (err as any).message}\n`);
                return result;
            }

            if (!!hostJson && !!hostJson.extensions && hostJson.extensions.durableTask) {

                const durableTask = hostJson.extensions.durableTask;
                if (!!durableTask.HubName || !!durableTask.hubName) {
                    result.hubName = !!durableTask.HubName ? durableTask.HubName : durableTask.hubName
                }

                if (!!durableTask.storageProvider && durableTask.storageProvider.type === 'mssql') {
                    result.storageProviderType = 'mssql';
                    result.connectionStringName = durableTask.storageProvider.connectionStringName;
                }
            }
        }
        return result;
    }

    private async saveConnectionString(connSettings: StorageConnectionSettings): Promise<void> {

        let connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            connStringMap = {};
        }

        connStringMap[connSettings.connStringHashKey] = {};

        this._context.secrets.store(connSettings.connStringHashKey, connSettings.storageConnString);

        await this.saveConnStringHashes(connStringMap);
    }

    private getConnStringHashes(): PersistedConnStringHashes | undefined {

        let connStringMap = this._context.globalState.get(MonitorViewList.ConnectionStringHashes);

        if (!connStringMap) {
            return undefined;
        }

        if (Array.isArray(connStringMap)) {
            // supporting legacy format
            return connStringMap.reduce((a, c) => { a[c] = {}; return a; }, {});
        }

        return connStringMap as PersistedConnStringHashes;
    }

    private async saveConnStringHashes(hashes: PersistedConnStringHashes): Promise<void>{

        await this._context.globalState.update(MonitorViewList.ConnectionStringHashes, hashes)
    }

    private async saveTaskHubs(storageConnString: string, taskHubs: string[]): Promise<void> {

        const connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            return;
        }

        const connStringInfo = connStringMap[StorageConnectionSettings.GetConnStringHashKey(storageConnString)];
        if (!connStringInfo) {
            return;
        }

        connStringInfo.taskHubNames = taskHubs;

        await this.saveConnStringHashes(connStringMap);
    }
}

function getTaskHubNamesFromTableNames(tableNames: string[]): string[] {

    const instancesTables: string[] = tableNames.map((table: any) => table.TableName)
        .filter((tableName: string) => tableName.endsWith('Instances'))
        .map((tableName: string) => tableName.substr(0, tableName.length - 'Instances'.length));

    const historyTables: string[] = tableNames.map((table: any) => table.TableName)
        .filter((tableName: string) => tableName.endsWith('History'))
        .map((tableName: string) => tableName.substr(0, tableName.length - 'History'.length));

    // Considering it to be a hub, if it has both *Instances and *History tables
    return instancesTables.filter(name => historyTables.indexOf(name) >= 0);
}

function fixTableEndpointUrl(tableEndpointUrl: string, accountName: string): string {

    if (!tableEndpointUrl) {
        tableEndpointUrl = `https://${accountName}.table.core.windows.net/`;
    } else if (!tableEndpointUrl.endsWith('/')) {
        tableEndpointUrl += '/';
    }

    return tableEndpointUrl;
}

// Tries to load the list of TaskHub names from a storage account.
export async function getTaskHubNamesFromTableStorage(tableEndpointUrl: string, accountName: string, accountKey: string): Promise<string[] | null> {

    tableEndpointUrl = fixTableEndpointUrl(tableEndpointUrl, accountName);

    const authHeaders = CreateAuthHeadersForTableStorage(accountName, accountKey, tableEndpointUrl);
    const response = await axios.get(`${tableEndpointUrl}Tables`, { headers: authHeaders });

    if (!response || !response.data || !response.data.value || response.data.value.length <= 0) {
        return null;
    }

    return getTaskHubNamesFromTableNames(response.data.value);
}

// Tries to load the list of TaskHub names from a storage account.
export async function getTaskHubNamesFromTableStorageWithUserToken(tableEndpointUrl: string, accountName: string, tokenCredential: DeviceTokenCredentials): Promise<string[] | null> {

    tableEndpointUrl = fixTableEndpointUrl(tableEndpointUrl, accountName);

    const authHeaders = await CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential);
    const response = await axios.get(`${tableEndpointUrl}Tables`, { headers: authHeaders });
 
    if (!response || !response.data || !response.data.value || response.data.value.length <= 0) {
        return null;
    }

    return getTaskHubNamesFromTableNames(response.data.value);
}