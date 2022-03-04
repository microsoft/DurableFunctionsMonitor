// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as path from 'path';

import { StorageConnectionSettings } from "./StorageConnectionSettings";
import { StorageAccountTreeItem } from "./StorageAccountTreeItem";

// Represents the Task Hub item in the TreeView
export class TaskHubTreeItem {

    constructor(private _parentItem: StorageAccountTreeItem,
        private _hubName: string,
        private _resourcesFolderPath: string,
        private _isCurrent: boolean) {
        
        this.label = _hubName;
    }

    readonly label: string;

    get storageAccountId(): string {
        return this._parentItem.storageAccountId;
    }

    get subscriptionId(): string {

        const match = /\/subscriptions\/([^\/]+)\/resourceGroups/gi.exec(this._parentItem.storageAccountId);
        if (!match || match.length <= 0) {
            return '';
        }
        return match[1];
    }

    get hubName(): string {
        return this._hubName;
    }

    // Gets associated storage connection settings
    get storageConnectionSettings(): StorageConnectionSettings {
        return new StorageConnectionSettings(this._parentItem.storageConnStrings, this._hubName);
    }

    // Item's icon
    get iconPath(): string {
        return path.join(this._resourcesFolderPath, this._parentItem.isTaskHubVisible(this._hubName) ? 'taskHubAttached.svg' : 'taskHub.svg');
    }

    // As a tooltip, showing the backend's URL
    get tooltip(): string {

        const backendUrl = this._parentItem.backendUrl;
        return !backendUrl ? '' : `${backendUrl}/${this._hubName}`;
    }

    // Something to show to the right of this item
    get description(): string {
        return this._isCurrent ? 'current' : '';
    }

    // This is what happens when the item is being clicked
    get command(): vscode.Command {
        return {
            title: 'Attach',
            command: 'durableFunctionsMonitorTreeView.attachToTaskHub',
            arguments: [this]
        };
    }

    // For binding context menu to this tree node
    get contextValue(): string {
        return this._parentItem.isAttached ? 'taskHub-attached' : 'taskHub-detached';
    }

    // For sorting
    static compare(first: TaskHubTreeItem, second: TaskHubTreeItem): number {
        const a = first.label!.toLowerCase();
        const b = second.label!.toLowerCase();
        return a === b ? 0 : (a < b ? -1 : 1);
    }

    // Drops itself from parent's list
    removeFromTree(): void {

        this._parentItem.childItems.splice(this._parentItem.childItems.indexOf(this), 1);
    }
}