// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConnStringUtils } from './ConnStringUtils';

// Aggregates parameters for connecting to a particular Task Hub
export class StorageConnectionSettings {

    get storageConnString(): string { return this._connString; };
    get eventHubsConnString(): string | undefined { return this._eventHubsConnString; };
    get hubName(): string { return this._hubName; };
    get connStringHashKey(): string { return this._connStringHashKey; }
    get hashKey(): string { return this._hashKey; }
    get isMsSql(): boolean { return !!ConnStringUtils.GetSqlServerName(this._connString); }
    get isNetherite(): boolean { return !!this._eventHubsConnString; }
    get isIdentityBasedConnection(): boolean { return !this.isMsSql && !ConnStringUtils.GetAccountKey(this._connString); }

    // For Storage we have one backed per account. For SQL - one backend per each Task Hub (because SQL Durability Provider does not support connections to multiple hubs)
    get hashKeyForBackend(): string { return this.isMsSql ? this._hashKey : this._connStringHashKey; }

    constructor(private _connString: string,
        private _hubName: string,
        private _eventHubsConnString?: string
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
