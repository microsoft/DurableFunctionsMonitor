// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from 'axios';

import * as CryptoJS from 'crypto-js';
import { Environment } from '@azure/ms-rest-azure-env';
import { TokenResponse } from 'adal-node';
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

    async getTaskHubNamesWithUserToken(tokenCredential: any): Promise<{ hubNames: string[], storageType: StorageType }> {

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

        return this.getTaskHubNamesFromTableStorage(this.CreateAuthHeadersForTableStorage(this._accountName, accountKey, this._tableEndpointUrl));
    }

    async getTaskHubNamesFromTableStorageWithUserToken(tokenCredential: any): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromTableStorage(await this.CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential));
    }

    async getTaskHubNamesFromNetheriteStorageWithKey(accountKey: string): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(this.CreateAuthHeadersForTableStorage(this._accountName, accountKey, this._tableEndpointUrl, `DurableTaskPartitions()`));
    }

    async getTaskHubNamesFromNetheriteStorageWithUserToken(tokenCredential: any): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(await this.CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential));
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

    // Creates the SharedKeyLite signature to query Table Storage REST API, also adds other needed headers
    private CreateAuthHeadersForTableStorage(accountName: string, accountKey: string, tableEndpointUrl: string, resource: string = 'Tables'): {} {

        // Local emulator URLs contain account name _after_ host (like http://127.0.0.1:10002/devstoreaccount1/ ),
        // and this part should be included when obtaining SAS
        const tableEndpointUrlParts = tableEndpointUrl.split('/');
        const tableQueryUrl = (tableEndpointUrlParts.length > 3 && !!tableEndpointUrlParts[3]) ?
            `${tableEndpointUrlParts[3]}/${resource}` :
            resource;

        const dateInUtc = new Date().toUTCString();
        const signature = CryptoJS.HmacSHA256(`${dateInUtc}\n/${accountName}/${tableQueryUrl}`, CryptoJS.enc.Base64.parse(accountKey));

        return {
            'Authorization': `SharedKeyLite ${accountName}:${signature.toString(CryptoJS.enc.Base64)}`,
            'x-ms-date': dateInUtc,
            'x-ms-version': '2015-12-11',
            'Accept': 'application/json;odata=nometadata'
        };
    }

    // Creates a user-specific access token for accessing Storage, also adds other needed headers
    private async CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential: any): Promise<{}> {

        let token = '';

        if (!tokenCredential.environment && !tokenCredential.clientId && !tokenCredential.username) {

            // It looks like MSAL is being used

            const scope = 'https://storage.azure.com/user_impersonation';
            
            token = (await tokenCredential.getToken(scope)).token;

        } else {

            // It looks like ADAL is being used

            // The default resourceId ('https://management.core.windows.net/') doesn't work for Storage.
            // So we need to replace it with the proper one.
            const storageResourceId = 'https://storage.azure.com';

            const environment = tokenCredential.environment;

            const credentials = new SequentialDeviceTokenCredentials(

                tokenCredential.clientId,
                tokenCredential.domain,
                tokenCredential.username,
                tokenCredential.tokenAudience,
                new Environment({
                    name: environment.name,
                    portalUrl: environment.portalUrl,
                    managementEndpointUrl: environment.managementEndpointUrl,
                    resourceManagerEndpointUrl: environment.resourceManagerEndpointUrl,
                    activeDirectoryEndpointUrl: environment.activeDirectoryEndpointUrl,
                    activeDirectoryResourceId: storageResourceId
                }),
                tokenCredential.tokenCache
            );

            token = (await credentials.getToken()).accessToken;
        }

        const dateInUtc = new Date().toUTCString();
        
        return {
            'Authorization': `Bearer ${token}`,
            'x-ms-date': dateInUtc,
            'x-ms-version': '2020-12-06',
            'Accept': 'application/json;odata=nometadata'
        };
    }
}

// Parallel execution of super.getToken() leads to https://github.com/microsoft/vscode-azure-account/issues/53
// Therefore we need to make sure the super.getToken() is always invoked sequentially, and we're doing that 
// with this simple Active Object pattern implementation
export class SequentialDeviceTokenCredentials extends DeviceTokenCredentials {

    public getToken(): Promise<TokenResponse> {

        return SequentialDeviceTokenCredentials.executeSequentially(() => super.getToken());
    }

    private static _workQueue: Promise<any> = Promise.resolve();

    private static executeSequentially<T>(action: () => Promise<T>): Promise<T> {
    
        // What goes to _workQueue should never throw (otherwise that exception will always get re-thrown later).
        // That's why we wrap it all with a new Promise(). This promise will resolve only _after_ action completes (or fails).
        return new Promise((resolve, reject) => {
    
            this._workQueue = this._workQueue.then(() => action().then(resolve, reject));
        });
    }
}
