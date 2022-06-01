// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';

import { StorageConnectionSettings } from "./StorageConnectionSettings";
import { ConnStringUtils } from "./ConnStringUtils";
import { TaskHubTreeItem } from "./TaskHubTreeItem";
import { MonitorViewList } from "./MonitorViewList";

// Represents the Storage Account item in the TreeView
export class StorageAccountTreeItem {

    constructor(private _connStrings: string[],
        private _resourcesFolderPath: string,
        private _monitorViewList: MonitorViewList,
        private _fromLocalSettingsJson: boolean = false) {
      
        this.label = ConnStringUtils.GetStorageName(_connStrings);
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

        this.isMsSqlStorage = !!ConnStringUtils.GetSqlServerName(this._connStrings[0]);
    }

    readonly label: string;

    readonly isMsSqlStorage: boolean;
    isV2StorageAccount: boolean = false;
    isIdentityBasedConnection: boolean = false;
    storageAccountId: string = '';

    collapsibleState?: vscode.TreeItemCollapsibleState;

    get isAttached(): boolean {
        return !!this.backendUrl;
    }

    get backendUrl(): string {
        return this._monitorViewList.getBackendUrl(this._connStrings);
    }

    get storageName(): string {
        return this.label!;
    }

    get storageConnStrings(): string[] {
        return this._connStrings;
    }

    get childItems(): TaskHubTreeItem[] {
        return this._taskHubItems;
    }

    get tooltip(): string {

        if (!!this.isIdentityBasedConnection) {
            return `identity-based`;
        }

        if (!!this._fromLocalSettingsJson) {
            return `from local.settings.json`;
        }

        if (!!this.isMsSqlStorage) {
            return 'MSSQL Storage Provider';
        }

        return ConnStringUtils.MaskStorageConnString(this._connStrings[0]);
    }

    // Something to show to the right of this item
    get description(): string {
        
        var desc = `${this._taskHubItems.length} Task Hubs`;

        if (this._fromLocalSettingsJson) {
            desc += ', current';
        }

        return desc;
    }

    // Item's icon
    get iconPath(): string {
        if (!!this.isMsSqlStorage) {
            return path.join(this._resourcesFolderPath, this.isAttached ? 'mssqlAttached.svg' : 'mssql.svg');
        }
        if (this.isV2StorageAccount) {
            return path.join(this._resourcesFolderPath, this.isAttached ? 'storageAccountV2Attached.svg' : 'storageAccountV2.svg');
        }
        return path.join(this._resourcesFolderPath, this.isAttached ? 'storageAccountAttached.svg' : 'storageAccount.svg');
    }

    // For binding context menu to this tree node
    get contextValue(): string {
        return this.isAttached ? 'storageAccount-attached' : 'storageAccount-detached';
    }

    // For sorting
    static compare(first: StorageAccountTreeItem, second: StorageAccountTreeItem): number {
        const a = first.storageName.toLowerCase();
        const b = second.storageName.toLowerCase();
        return a === b ? 0 : (a < b ? -1 : 1);
    }

    // Creates or returns existing TaskHubTreeItem by hub name
    getOrAdd(hubName: string, isFromCurrentProject: boolean = false): TaskHubTreeItem {

        var hubItem = this._taskHubItems.find(taskHub => taskHub.hubName.toLowerCase() === hubName.toLowerCase());
        if (!hubItem) {
            hubItem = new TaskHubTreeItem(this, hubName, this._resourcesFolderPath, isFromCurrentProject);
            this._taskHubItems.push(hubItem);
            this._taskHubItems.sort(TaskHubTreeItem.compare);
        }

        return hubItem;
    }

    isTaskHubVisible(hubName: string): boolean {
        return this._monitorViewList.isMonitorViewVisible(new StorageConnectionSettings(this._connStrings, hubName));
    }
    
    private _taskHubItems: TaskHubTreeItem[] = [];
}