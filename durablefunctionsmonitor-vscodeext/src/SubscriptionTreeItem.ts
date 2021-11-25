import * as vscode from 'vscode';
import * as path from 'path';

import { StorageAccountTreeItem } from "./StorageAccountTreeItem";
import { StorageAccountTreeItems } from "./StorageAccountTreeItems";

// Represents an Azure Subscription in the TreeView
export class SubscriptionTreeItem extends vscode.TreeItem {

    get isSubscriptionTreeItem(): boolean { return true; }

    // Returns storage account nodes, that belong to this subscription
    get storageAccountNodes(): StorageAccountTreeItem[] {
        return this._storageAccounts.nodes.filter(a => this.isMyStorageAccount(a));
    }

    constructor(subscriptionName: string,
        private _storageAccounts: StorageAccountTreeItems,
        private _storageAccountNames: string[],
        protected _resourcesFolderPath: string
    ) {
        super(subscriptionName, vscode.TreeItemCollapsibleState.Expanded);
        this.iconPath = path.join(this._resourcesFolderPath, 'azureSubscription.svg');
    }

    // Checks whether this storage account belongs to this subscription.
    isMyStorageAccount(accNode: StorageAccountTreeItem): boolean {

        // The only way to do this is by matching the account name against all account names in this subscription.
        // We need to fetch these acccount names for other purposes anyway, so why not using them here as well 
        // (as opposite to making separate roundtrips to get subscriptionId for a given account).
        return this._storageAccountNames.includes(accNode.storageName);
    }
}

// Represents a special node in the TreeView where all 'orphaned' (those with unidentified subscription) storage accounts go
export class DefaultSubscriptionTreeItem extends SubscriptionTreeItem {

    constructor(storageAccounts: StorageAccountTreeItems,
        private _otherSubscriptionNodes: SubscriptionTreeItem[],
        resourcesFolderPath: string
    ) {
        super('Storages', storageAccounts, [], resourcesFolderPath);
        this.iconPath = path.join(this._resourcesFolderPath, 'storageAccounts.svg');
    }

    // Checks whether this storage account belongs to this tree item.
    isMyStorageAccount(accNode: StorageAccountTreeItem): boolean {

        // Let's see if this account belongs to any other subscription node. If not - it's ours. 
        return this._otherSubscriptionNodes.every(n => !n.isMyStorageAccount(accNode));
    }
}