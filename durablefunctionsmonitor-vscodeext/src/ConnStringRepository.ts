// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

import { StorageConnectionSettings } from "./StorageConnectionSettings";

type PersistedConnStringHashes = {
    [hash: string]: {
        taskHubs?: string []
    }
};

const ConnectionStringHashesKey = 'ConnectionStringHashes';
const EventHubsConnStringHashSuffix = '|EventHubsConnectionString';

// Loads/stores persisted connection strings in VsCode Secret Storage
export class ConnStringRepository {

    constructor(private _context: vscode.ExtensionContext) { }

    async forgetConnectionString(storageConnString: string): Promise<any> {

        const connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(storageConnString);

        await this._context.secrets.delete(connStringHashKey);
        await this._context.secrets.delete(connStringHashKey + EventHubsConnStringHashSuffix);

        let connStringHashes = this.getConnStringHashes();
        if (!connStringHashes) {
            return;
        }

        delete connStringHashes[connStringHashKey];

        await this.saveConnStringHashes(connStringHashes);
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

    getPersistedConnStringData(connString: string): { taskHubs?: string [] } | undefined {

        const connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            return undefined;
        }

        return connStringMap[StorageConnectionSettings.GetConnStringHashKey(connString)];
    }

    async getEventHubsConnString(storageConnString: string): Promise<string | undefined> {

        const connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(storageConnString);
        return await this._context.secrets.get(connStringHashKey + EventHubsConnStringHashSuffix);
    }

    async saveConnectionString(connSettings: StorageConnectionSettings): Promise<void> {

        let connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            connStringMap = {};
        }

        if (!connStringMap[connSettings.connStringHashKey]) {
            
            connStringMap[connSettings.connStringHashKey] = {};
        }

        await this._context.secrets.store(connSettings.connStringHashKey, connSettings.storageConnString);

        if (!!connSettings.eventHubsConnString) {
            
            await this._context.secrets.store(connSettings.connStringHashKey + EventHubsConnStringHashSuffix, connSettings.eventHubsConnString);

        } else {

            await this._context.secrets.delete(connSettings.connStringHashKey + EventHubsConnStringHashSuffix);
        }

        await this.saveConnStringHashes(connStringMap);
    }

    async saveTaskHubs(storageConnString: string, schemaName: string | undefined, taskHubs: string[]): Promise<void> {

        const connStringMap = this.getConnStringHashes();
        if (!connStringMap) {
            return;
        }

        const connStringInfo = connStringMap[StorageConnectionSettings.GetConnStringHashKey(storageConnString)];
        if (!connStringInfo) {
            return;
        }

        if (!connStringInfo.taskHubs) {
            connStringInfo.taskHubs = [];
        }

        for (const hubName of taskHubs) {

            const schemaAndHubName = `${schemaName || 'dt'}/${hubName}`;

            if (!connStringInfo.taskHubs.includes(schemaAndHubName)) {
                
                connStringInfo.taskHubs.push(schemaAndHubName);
            }
        }

        await this.saveConnStringHashes(connStringMap);
    }

    private getConnStringHashes(): PersistedConnStringHashes | undefined {

        let connStringMap = this._context.globalState.get(ConnectionStringHashesKey);

        if (!connStringMap) {
            return undefined;
        }

        if (Array.isArray(connStringMap)) {
            // supporting legacy format
            return connStringMap.reduce((a, c) => { a[c] = {}; return a; }, {});
        }

        return connStringMap as PersistedConnStringHashes;
    }

    private async saveConnStringHashes(hashes: PersistedConnStringHashes): Promise<void> {

        await this._context.globalState.update(ConnectionStringHashesKey, hashes)
    }
}