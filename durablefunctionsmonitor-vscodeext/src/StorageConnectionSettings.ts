// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as CryptoJS from 'crypto-js';

import { ConnStringUtils } from "./ConnStringUtils";

// Aggregates parameters for connecting to a particular Task Hub
export class StorageConnectionSettings {

    get storageConnStrings(): string[] { return this._connStrings; };
    get hubName(): string { return this._hubName; };
    get connStringHashKey(): string { return this._connStringHashKey; }
    get hashKey(): string { return this._hashKey; }
    get isFromLocalSettingsJson(): boolean { return this._fromLocalSettingsJson; }
    get isMsSql(): boolean { return !!ConnStringUtils.GetSqlServerName(this._connStrings[0]); }

    constructor(private _connStrings: string[],
        private _hubName: string,
        private _fromLocalSettingsJson: boolean = false) {

        this._connStringHashKey = StorageConnectionSettings.GetConnStringHashKey(this._connStrings);
        this._hashKey = this._connStringHashKey + this._hubName.toLowerCase();
    }

    static GetConnStringHashKey(connStrings: string[]): string {

        const sqlServerName = ConnStringUtils.GetSqlServerName(connStrings[0]);

        if (!!sqlServerName) {
            return sqlServerName + ConnStringUtils.GetSqlDatabaseName(connStrings[0]);
        }

        return ConnStringUtils.GetTableEndpoint(connStrings[0]).toLowerCase();
    }

    private readonly _connStringHashKey: string;
    private readonly _hashKey: string;
}

// Creates the SharedKeyLite signature to query Table Storage REST API, also adds other needed headers
export function CreateAuthHeadersForTableStorage(accountName: string, accountKey: string, queryUrl: string): {} {

    const dateInUtc = new Date().toUTCString();
    const signature = CryptoJS.HmacSHA256(`${dateInUtc}\n/${accountName}/${queryUrl}`, CryptoJS.enc.Base64.parse(accountKey));

    return {
        'Authorization': `SharedKeyLite ${accountName}:${signature.toString(CryptoJS.enc.Base64)}`,
        'x-ms-date': dateInUtc,
        'x-ms-version': '2015-12-11',
        'Accept': 'application/json;odata=nometadata'
    };
}
