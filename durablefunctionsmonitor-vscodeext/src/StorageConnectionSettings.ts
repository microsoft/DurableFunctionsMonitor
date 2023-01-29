// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as CryptoJS from 'crypto-js';
import { DeviceTokenCredentials } from '@azure/ms-rest-nodeauth';
import { Environment } from "@azure/ms-rest-azure-env";
import { TokenResponse } from "adal-node";

import { ConnStringUtils } from "./ConnStringUtils";

// Full typings for this can be found here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
export type AzureSubscription = { session: { credentials2: any }, subscription: { subscriptionId: string, displayName: string } };

// Aggregates parameters for connecting to a particular Task Hub
export class StorageConnectionSettings {

    get storageConnString(): string { return this._connString; };
    get hubName(): string { return this._hubName; };
    get connStringHashKey(): string { return this._connStringHashKey; }
    get hashKey(): string { return this._hashKey; }
    get isMsSql(): boolean { return !!ConnStringUtils.GetSqlServerName(this._connString); }
    get isIdentityBasedConnection(): boolean { return !this.isMsSql && !ConnStringUtils.GetAccountKey(this._connString); }

    constructor(private _connString: string,
        private _hubName: string
    ) {

        this._connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(this._connString);
        this._hashKey = this._connStringHashKey + this._hubName.toLowerCase();
    }

    static GetConnStringHashKey(connString: string): string {

        const sqlServerName = ConnStringUtils.GetSqlServerName(connString).toLowerCase();

        if (!!sqlServerName) {
            return `Server:${sqlServerName};Initial Catalog=${ConnStringUtils.GetSqlDatabaseName(connString).toLowerCase()}`;
        }

        return ConnStringUtils.GetTableEndpoint(connString).toLowerCase();
    }

    private readonly _connStringHashKey: string;
    private readonly _hashKey: string;
}

// Creates the SharedKeyLite signature to query Table Storage REST API, also adds other needed headers
export function CreateAuthHeadersForTableStorage(accountName: string, accountKey: string, tableEndpointUrl: string): {} {

    // Local emulator URLs contain account name _after_ host (like http://127.0.0.1:10002/devstoreaccount1/ ),
    // and this part should be included when obtaining SAS
    const tableEndpointUrlParts = tableEndpointUrl.split('/');
    const tableQueryUrl = (tableEndpointUrlParts.length > 3 && !!tableEndpointUrlParts[3]) ?
        `${tableEndpointUrlParts[3]}/Tables` :
        'Tables';

    const dateInUtc = new Date().toUTCString();
    const signature = CryptoJS.HmacSHA256(`${dateInUtc}\n/${accountName}/${tableQueryUrl}`, CryptoJS.enc.Base64.parse(accountKey));

    return {
        'Authorization': `SharedKeyLite ${accountName}:${signature.toString(CryptoJS.enc.Base64)}`,
        'x-ms-date': dateInUtc,
        'x-ms-version': '2015-12-11',
        'Accept': 'application/json;odata=nometadata'
    };
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

// Creates a user-specific access token for accessing Storage, also adds other needed headers
export async function CreateIdentityBasedAuthHeadersForTableStorage(tokenCredential: DeviceTokenCredentials): Promise<{}> {

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

    const token = await credentials.getToken();

    const dateInUtc = new Date().toUTCString();
    
    return {
        'Authorization': `Bearer ${token.accessToken}`,
        'x-ms-date': dateInUtc,
        'x-ms-version': '2020-12-06',
        'Accept': 'application/json;odata=nometadata'
    };
}
