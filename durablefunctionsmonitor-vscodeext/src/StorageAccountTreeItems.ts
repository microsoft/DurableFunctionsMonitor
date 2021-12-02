// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { MonitorView } from "./MonitorView";
import { MonitorViewList } from "./MonitorViewList";
import { StorageAccountTreeItem } from "./StorageAccountTreeItem";
import { StorageConnectionSettings } from "./BackendProcess";
import { ConnStringUtils } from "./ConnStringUtils";
import { TaskHubTreeItem } from "./TaskHubTreeItem";

// Represents the list of Storage Account items in the TreeView
export class StorageAccountTreeItems {

    constructor(private _resourcesFolderPath: string, private _monitorViewList: MonitorViewList) {}

    get nodes(): StorageAccountTreeItem[] {
        return this._storageAccountItems;
    }

    get taskHubNodes(): TaskHubTreeItem[] {
        return ([] as TaskHubTreeItem[]).concat(...this._storageAccountItems.map(n => n.childItems));
    }

    // Adds a node to the tree for MonitorView, that's already running
    addNodeForMonitorView(monitorView: MonitorView): void {

        const storageConnStrings = monitorView.storageConnectionSettings.storageConnStrings;
        const storageName = ConnStringUtils.GetStorageName(storageConnStrings);
        const hubName = monitorView.storageConnectionSettings.hubName;

        // Only creating a new tree node, if no node for this account exists so far
        var node = this._storageAccountItems.find(item => item.storageName.toLowerCase() === storageName.toLowerCase());
        if (!node) {

            node = new StorageAccountTreeItem(storageConnStrings, this._resourcesFolderPath, this._monitorViewList);

            this._storageAccountItems.push(node);
            this._storageAccountItems.sort(StorageAccountTreeItem.compare);
        }

        node.getOrAdd(hubName);
    }

    // Adds a detached node to the tree for the specified storage connection settings
    addNodeForConnectionSettings(connSettings: StorageConnectionSettings, isV2StorageAccount: boolean = false, storageAccountId: string = ''): void {

        const storageConnStrings = connSettings.storageConnStrings;
        const hubName = connSettings.hubName;

        // Trying to infer account name from connection string
        const storageName = ConnStringUtils.GetStorageName(storageConnStrings);
        if (!storageName) {
            return;
        }

        // Only creating a new tree node, if no node for this account exists so far
        var node = this._storageAccountItems.find(item => item.storageName === storageName);
        if (!node) {

            node = new StorageAccountTreeItem(storageConnStrings,
                this._resourcesFolderPath,
                this._monitorViewList,
                connSettings.isFromLocalSettingsJson
            );
 
            this._storageAccountItems.push(node);
            this._storageAccountItems.sort(StorageAccountTreeItem.compare);
        }

        node.isV2StorageAccount = isV2StorageAccount;
        node.storageAccountId = storageAccountId;

        node.getOrAdd(hubName);
    }
    
    private _storageAccountItems: StorageAccountTreeItem[] = [];
}