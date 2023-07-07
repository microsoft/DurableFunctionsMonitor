// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { StorageAccount } from '@azure/arm-storage';
import { Settings } from './Settings';
import { ResourceGraphClient } from '@azure/arm-resourcegraph';
import { DeviceTokenCredentials } from '@azure/ms-rest-nodeauth';

export class ConnStringUtils {
    
    // Extracts AccountName from Storage Connection String
    static GetAccountName(connString: string): string {
        const match = /AccountName=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts AccountKey from Storage Connection String
    static GetAccountKey(connString: string): string {
        const match = /AccountKey=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts DefaultEndpointsProtocol from Storage Connection String
    static GetDefaultEndpointsProtocol(connString: string): string {
        const match = /DefaultEndpointsProtocol=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : 'https';
    }

    // Extracts TableEndpoint from Storage Connection String
    static GetTableEndpoint(connString: string): string {

        const accountName = ConnStringUtils.GetAccountName(connString);
        if (!accountName) {
            return '';
        }

        const endpointsProtocol = ConnStringUtils.GetDefaultEndpointsProtocol(connString);

        const suffixMatch = /EndpointSuffix=([^;]+)/i.exec(connString);
        if (!!suffixMatch && suffixMatch.length > 0) {

            return `${endpointsProtocol}://${accountName}.table.${suffixMatch[1]}/`;
        }

        const endpointMatch = /TableEndpoint=([^;]+)/i.exec(connString);
        return (!!endpointMatch && endpointMatch.length > 0) ? endpointMatch[1] : `${endpointsProtocol}://${accountName}.table.core.windows.net/`;
    }

    // Replaces 'UseDevelopmentStorage=true' with full Storage Emulator connection string
    static ExpandEmulatorShortcutIfNeeded(connString: string): string {

        if (connString.includes('UseDevelopmentStorage=true')) {
            return Settings().storageEmulatorConnectionString;
        }

        return connString;
    }

    // Extracts server name from MSSQL Connection String
    static GetSqlServerName(connString: string): string {
        const match = /(Data Source|Server)=([^;]+)/i.exec(connString);
        return (!!match && match.length > 1) ? match[2] : '';
    }
    
    // Extracts database name from MSSQL Connection String
    static GetSqlDatabaseName(connString: string): string {
        const match = /Initial Catalog=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts human-readable storage name from a bunch of connection strings
    static GetStorageName(connString: string): string {

        const serverName = this.GetSqlServerName(connString);

        if (!serverName) {
            return this.GetAccountName(connString);
        }

        const dbName = this.GetSqlDatabaseName(connString);

        return serverName + (!dbName ? '' : '/' + dbName);
    }

    // Replaces AccountKey with stars
    static MaskStorageConnString(connString: string): string {
        return connString.replace(/AccountKey=[^;]+/gi, 'AccountKey=*****');
    }

    // Formats Storage Connection String for a given StorageAccount
    static getConnectionStringForStorageAccount(account: StorageAccount, storageKey?: string): string {

        var endpoints = ''; 
        if (!!account.primaryEndpoints) {
            endpoints = `BlobEndpoint=${account.primaryEndpoints!.blob};QueueEndpoint=${account.primaryEndpoints!.queue};TableEndpoint=${account.primaryEndpoints!.table};FileEndpoint=${account.primaryEndpoints!.file};`;
        } else {
            endpoints = `BlobEndpoint=https://${account.name}.blob.core.windows.net/;QueueEndpoint=https://${account.name}.queue.core.windows.net/;TableEndpoint=https://${account.name}.table.core.windows.net/;FileEndpoint=https://${account.name}.file.core.windows.net/;`;
        }
    
        if (!storageKey) {
            return `DefaultEndpointsProtocol=https;AccountName=${account.name};${endpoints}`;
        }
    
        return `DefaultEndpointsProtocol=https;AccountName=${account.name};AccountKey=${storageKey};${endpoints}`;
    }

    // Queries Azure Resource Manager API for the list of resources of a given type
    static async getAzureResources(creds: DeviceTokenCredentials, subscriptionId: string, resourceType: string, resourceName?: string): Promise<any[]>{

        const resourceGraphClient = new ResourceGraphClient(creds);
        const response = await resourceGraphClient.resources({
            subscriptions: [subscriptionId],
            query: `resources | where type == "${resourceType}"${ !!resourceName ? ` and name == "${resourceName}"` : '' }`
        });

        return response.data ?? [];
    }

    // Polyfills ADAL's and MSAL's getToken()
    static async getAccessTokenForAzureResourceManager(creds: any): Promise<string>{

        const tokenWrapper = await creds.getToken();
        // Depending on whether ADAL or MSAL is used, the field is called either 'accessToken' or 'token'
        const accessToken = tokenWrapper.accessToken ?? tokenWrapper.token;

        return accessToken;
    }
}