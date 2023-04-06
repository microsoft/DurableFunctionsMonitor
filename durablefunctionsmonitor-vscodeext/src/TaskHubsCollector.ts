// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from 'axios';

import { CreateAuthHeadersForTableStorage, CreateIdentityBasedAuthHeadersForTableStorage } from "./StorageConnectionSettings";
import { DeviceTokenCredentials } from '@azure/ms-rest-nodeauth';

export type StorageType = 'default' | 'netherite';

// Tries to load the list of TaskHub names from a storage account.
export class TaskHubsCollector {

    constructor(tableEndpointUrl: string, accountName: string) {

        if (!tableEndpointUrl) {
            tableEndpointUrl = `https://${accountName}.table.core.windows.net/`;
        } else if (!tableEndpointUrl.endsWith('/')) {
            tableEndpointUrl += '/';
        }

        this._tableEndpointUrl = tableEndpointUrl;
        this._accountName = accountName;
    }

    async getTaskHubNamesWithKey(accountKey: string): Promise<{ hubNames: string[], storageType: StorageType }> {

        const netheriteHubsPromise = this.getTaskHubNamesFromNetheriteStorageWithKey(accountKey);
        const defaultHubsPromise = this.getTaskHubNamesFromTableStorageWithKey(accountKey);

        const netheriteHubs = await netheriteHubsPromise;

        if (!!netheriteHubs) {

            return { hubNames: netheriteHubs, storageType: 'netherite' };
        }

        const defaultHubs = await defaultHubsPromise;

        return { hubNames: defaultHubs ?? [], storageType: 'default' };
    }

    async getTaskHubNamesWithUserToken(tokenCredential: DeviceTokenCredentials): Promise<{ hubNames: string[], storageType: StorageType }> {

        const netheriteHubsPromise = this.getTaskHubNamesFromNetheriteStorageWithUserToken(tokenCredential);
        const defaultHubsPromise = this.getTaskHubNamesFromTableStorageWithUserToken(tokenCredential);

        const netheriteHubs = await netheriteHubsPromise;

        if (!!netheriteHubs) {

            return { hubNames: netheriteHubs, storageType: 'netherite' };
        }

        const defaultHubs = await defaultHubsPromise;

        return { hubNames: defaultHubs ?? [], storageType: 'default' };
    }

    async getTaskHubNamesFromTableStorageWithKey(accountKey: string): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromTableStorage(CreateAuthHeadersForTableStorage(this._accountName, accountKey, this._tableEndpointUrl));
    }

    async getTaskHubNamesFromTableStorageWithUserToken(tokenCredential: DeviceTokenCredentials): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromTableStorage(await CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential));
    }

    async getTaskHubNamesFromNetheriteStorageWithKey(accountKey: string): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(CreateAuthHeadersForTableStorage(this._accountName, accountKey, this._tableEndpointUrl, `DurableTaskPartitions()`));
    }

    async getTaskHubNamesFromNetheriteStorageWithUserToken(tokenCredential: DeviceTokenCredentials): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(await CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential));
    }

    private readonly _tableEndpointUrl: string;
    private readonly _accountName: string    

    private getTaskHubNamesFromTableNames(tableNames: string[]): string[] {

        const instancesTables: string[] = tableNames.map((table: any) => table.TableName)
            .filter((tableName: string) => tableName.endsWith('Instances'))
            .map((tableName: string) => tableName.substr(0, tableName.length - 'Instances'.length));

        const historyTables: string[] = tableNames.map((table: any) => table.TableName)
            .filter((tableName: string) => tableName.endsWith('History'))
            .map((tableName: string) => tableName.substr(0, tableName.length - 'History'.length));

        // Considering it to be a hub, if it has both *Instances and *History tables
        return instancesTables.filter(name => historyTables.indexOf(name) >= 0);
    }

    private async getTaskHubNamesFromTableStorage(authHeaders: {}): Promise<string[] | undefined> {

        const response = await axios.get(`${this._tableEndpointUrl}Tables`, { headers: authHeaders });

        if (!response?.data?.value) {
            return;
        }

        return this.getTaskHubNamesFromTableNames(response.data.value);
    }

    private async getTaskHubNamesFromNetheriteStorage(authHeaders: {}): Promise<string[] | undefined> {

        try {
 
            const response = await axios.get(`${this._tableEndpointUrl}DurableTaskPartitions()?$select=PartitionKey`, { headers: authHeaders });
    
            if (!response?.data?.value) {
                return;
            }
    
            const partitionKeys = response.data.value.map((v: any) => v.PartitionKey);
            const distinctPartitionKeys = partitionKeys.filter((name: string, index: number, self: string[]) => self.indexOf(name) === index);
    
            return distinctPartitionKeys;
                
        } catch (err) {
            
            return;
        }
    }
}