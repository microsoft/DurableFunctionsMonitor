// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import axios from 'axios';

import * as CryptoJS from 'crypto-js';
import { TokenCredential } from '@azure/identity';
import { AzureSubscription } from '@microsoft/vscode-azext-azureauth';

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

    async getTaskHubNamesWithUserToken(azureSubscription: AzureSubscription): Promise<{ hubNames: string[], storageType: StorageType }> {

        const netheriteHubsPromise = this.getTaskHubNamesFromNetheriteStorageWithUserToken(azureSubscription);
        const defaultHubsPromise = this.getTaskHubNamesFromTableStorageWithUserToken(azureSubscription);

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

    async getTaskHubNamesFromTableStorageWithUserToken(azureSubscription: AzureSubscription): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromTableStorage(await this.CreateIdentityBasedAuthHeadersForTableStorage(azureSubscription));
    }

    async getTaskHubNamesFromNetheriteStorageWithKey(accountKey: string): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(this.CreateAuthHeadersForTableStorage(this._accountName, accountKey, this._tableEndpointUrl, `DurableTaskPartitions()`));
    }

    async getTaskHubNamesFromNetheriteStorageWithUserToken(azureSubscription: AzureSubscription): Promise<string[] | undefined> {

        return this.getTaskHubNamesFromNetheriteStorage(await this.CreateIdentityBasedAuthHeadersForTableStorage(azureSubscription));
    }

    private readonly _tableEndpointUrl: string;
    private readonly _accountName: string    

    private getTaskHubNamesFromTableNames(tableNames: {TableName : string}[]): string[] {

        const instancesTables: string[] = tableNames.map(table => table.TableName)
            .filter((tableName: string) => tableName.endsWith('Instances'))
            .map((tableName: string) => tableName.substr(0, tableName.length - 'Instances'.length));

        const historyTables: string[] = tableNames.map(table => table.TableName)
            .filter((tableName: string) => tableName.endsWith('History'))
            .map((tableName: string) => tableName.substr(0, tableName.length - 'History'.length));

        // Considering it to be a hub, if it has both *Instances and *History tables
        return instancesTables.filter(name => historyTables.indexOf(name) >= 0);
    }

    private async getTaskHubNamesFromTableStorage(authHeaders: {}): Promise<string[] | undefined> {

        let result: {TableName: string}[] | undefined = undefined;

        let url = `${this._tableEndpointUrl}Tables`;
        while (true) {
            
            const response = await axios.get(url, { headers: authHeaders });
    
            if (response?.data?.value) {

                result ??= [];
                result.push(...response.data.value);
            }

            // Header names are case-insensitive, so need to try all cases
            const nextTableHeaderName = Object.keys(response.headers).find(h => h.toLowerCase() === 'x-ms-continuation-nexttablename');

            const nextTableNameHeaderValue = nextTableHeaderName ? response.headers[nextTableHeaderName] : undefined;
            if (!nextTableNameHeaderValue) {
                break;
            }

            url = `${this._tableEndpointUrl}Tables?NextTableName=${nextTableNameHeaderValue}`;
        }

        if (!!result) {
            
            return this.getTaskHubNamesFromTableNames(result);
        }
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
    private async CreateIdentityBasedAuthHeadersForTableStorage(azureSubscription: AzureSubscription): Promise<{}> {

        // Looks like azureSubscription.credential.getToken(scopes) does not respect scopes (getting a token with default 'https://management.core.windows.net' audience instead of Storage-specific scope) 
        // Issue: https://github.com/microsoft/vscode-azuretools/issues/1596
        // So will have to use vscode.authentication directly

        const providerId = 'microsoft';

        const scopes = [
            'https://storage.azure.com/user_impersonation',
            `VSCODE_TENANT:${azureSubscription.tenantId}`
        ];

        // First trying silent mode
        let authSession = await vscode.authentication.getSession(providerId, scopes, { silent: true });

        if (!authSession) {
            
            // Now asking to authenticate, if needed
            authSession = await vscode.authentication.getSession(providerId, scopes, { createIfNone: true });
        }

        const token = authSession.accessToken;

        const dateInUtc = new Date().toUTCString();
        
        return {
            'Authorization': `Bearer ${token}`,
            'x-ms-date': dateInUtc,
            'x-ms-version': '2020-12-06',
            'Accept': 'application/json;odata=nometadata'
        };
    }
}