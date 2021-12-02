// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

import { StorageManagementClient } from "@azure/arm-storage";
import { StorageAccount } from "@azure/arm-storage/src/models";

import { SubscriptionTreeItem, DefaultSubscriptionTreeItem } from "./SubscriptionTreeItem";
import { StorageAccountTreeItems } from "./StorageAccountTreeItems";
import { getTaskHubNamesFromTableStorage } from './MonitorViewList';
import { ConnStringUtils } from "./ConnStringUtils";
import { Settings } from './Settings';
import { StorageConnectionSettings } from "./BackendProcess";

// Full typings for this can be found here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
type AzureSubscription = { session: { credentials2: any }, subscription: { subscriptionId: string, displayName: string } };

// Represents the list of Azure Subscriptions in the TreeView
export class SubscriptionTreeItems {

    constructor(private _context: vscode.ExtensionContext,
        private _azureAccount: any,
        private _storageAccounts: StorageAccountTreeItems,
        private _onStorageAccountsChanged: () => void,
        private _resourcesFolderPath: string,
        private _log: (l: string) => void)
    { }

    // Returns subscription nodes, but only those that have some TaskHubs in them
    async getNonEmptyNodes(): Promise<SubscriptionTreeItem[]> {

        if (!this._nodes) {

            // Need to wait until Azure Account ext loads the filtered list of subscriptions
            if (!this._azureAccount || !await this._azureAccount.waitForFilters()) {

                this._nodes = [];

            } else {

                // Showing only filtered subscriptions and ignoring those, which are hidden
                const subscriptions = this._azureAccount.filters;

                this._nodes = await this.loadSubscriptionNodes(subscriptions);
            }

            // Adding the 'default subscription' node, where all orphaned (unrecognized) storage accounts will go to.
            this._nodes.push(new DefaultSubscriptionTreeItem(this._storageAccounts, this._nodes.slice(), this._resourcesFolderPath));

            // Also pinging local Storage Emulator and deliberately not awaiting
            this.tryLoadingTaskHubsForLocalStorageEmulator();
        }

        // Only showing non-empty subscriptions
        return this._nodes.filter(n => n.storageAccountNodes.length > 0);
    }

    cleanup(): void {
        this._nodes = undefined;
    }
    
    private _nodes?: SubscriptionTreeItem[];

    private async tryLoadingStorageAccountsForSubscription(storageManagementClient: StorageManagementClient): Promise<StorageAccount[]> {
 
        const result: StorageAccount[] = [];

        var storageAccountsPartialResponse = await storageManagementClient.storageAccounts.list();
        result.push(...storageAccountsPartialResponse);

        while (!!storageAccountsPartialResponse.nextLink) {

            storageAccountsPartialResponse = await storageManagementClient.storageAccounts.listNext(storageAccountsPartialResponse.nextLink);
            result.push(...storageAccountsPartialResponse);
        }

        return result;
    }

    private static HasAlreadyShownStorageV2Warning = false;

    private showWarning4V2StorageAccounts(v2AccountNames: string[]): void {

        const DfmDoNotShowStorageV2Warning = 'DfmDoNotShowStorageV2Warning';

        if (!!SubscriptionTreeItems.HasAlreadyShownStorageV2Warning || !!this._context.globalState.get(DfmDoNotShowStorageV2Warning, false) || !v2AccountNames.length) {
            return;
        }
        SubscriptionTreeItems.HasAlreadyShownStorageV2Warning = true;

        const prompt = `Looks like your Durable Functions are using the following General-purpose V2 Storage accounts: ${v2AccountNames.join(', ')}. Combined with Durable Functions, V2 Storage accounts can be more expensive under high loads. Consider using General-purpose V1 Storage instead.`;
        vscode.window.showWarningMessage(prompt, 'OK', `Don't Show Again`).then(answer => {

            if (answer === `Don't Show Again`) {
                this._context.globalState.update(DfmDoNotShowStorageV2Warning, true);
            }
        });
    }

    private async tryLoadingTaskHubsForSubscription(storageManagementClient: StorageManagementClient, storageAccounts: StorageAccount[]): Promise<boolean> {

        const v2AccountNames: string[] = [];
        var taskHubsAdded = false;
        await Promise.all(storageAccounts.map(async storageAccount => {

            // Extracting resource group name
            const match = /\/resourceGroups\/([^\/]+)\/providers/gi.exec(storageAccount.id!);
            if (!match || match.length <= 0) {
                return;
            }
            const resourceGroupName = match[1];

            const storageKeys = await storageManagementClient.storageAccounts.listKeys(resourceGroupName, storageAccount.name!);
            if (!storageKeys.keys || storageKeys.keys.length <= 0) {
                return;
            }

            // Choosing the key that looks best
            var storageKey = storageKeys.keys.find(k => !k.permissions || k.permissions.toLowerCase() === "full");
            if (!storageKey) {
                storageKey = storageKeys.keys.find(k => !k.permissions || k.permissions.toLowerCase() === "read");
            }
            if (!storageKey) {
                return;
            }

            var tableEndpoint = '';
            if (!!storageAccount.primaryEndpoints) {
                tableEndpoint = storageAccount.primaryEndpoints.table!;
            }

            const hubNames = await getTaskHubNamesFromTableStorage(storageAccount.name!, storageKey.value!, tableEndpoint);
            if (!hubNames || !hubNames.length) {
                return;
            }

            const isV2StorageAccount = storageAccount.kind === 'StorageV2';

            if (isV2StorageAccount) {
                v2AccountNames.push(storageAccount.name!);
            }

            for (const hubName of hubNames) {

                this._storageAccounts.addNodeForConnectionSettings(
                    new StorageConnectionSettings([this.getConnectionStringForStorageAccount(storageAccount, storageKey.value!)], hubName, false),
                    isV2StorageAccount,
                    storageAccount.id
                );
                
                taskHubsAdded = true;
            }
        }));

        // Notifying about potentially higher costs of V2 accounts
        this.showWarning4V2StorageAccounts(v2AccountNames);

        return taskHubsAdded;
    }

    private async tryLoadingTaskHubsForLocalStorageEmulator(): Promise<void> {

        const emulatorConnString = Settings().storageEmulatorConnectionString;

        const accountName = ConnStringUtils.GetAccountName(emulatorConnString);
        const accountKey = ConnStringUtils.GetAccountKey(emulatorConnString);
        const tableEndpoint = ConnStringUtils.GetTableEndpoint(emulatorConnString);

        const hubNames = await getTaskHubNamesFromTableStorage(accountName, accountKey, tableEndpoint);
        if (!hubNames) {
            return;
        }

        for (const hubName of hubNames) {
            this._storageAccounts.addNodeForConnectionSettings(new StorageConnectionSettings([emulatorConnString], hubName));
        }

        if (hubNames.length > 0) {
            this._onStorageAccountsChanged();
        }
    }

    private getConnectionStringForStorageAccount(account: StorageAccount, storageKey: string): string {

        var endpoints = ''; 
        if (!!account.primaryEndpoints) {
            endpoints = `BlobEndpoint=${account.primaryEndpoints!.blob};QueueEndpoint=${account.primaryEndpoints!.queue};TableEndpoint=${account.primaryEndpoints!.table};FileEndpoint=${account.primaryEndpoints!.file};`;
        } else {
            endpoints = `BlobEndpoint=https://${account.name}.blob.core.windows.net/;QueueEndpoint=https://${account.name}.queue.core.windows.net/;TableEndpoint=https://${account.name}.table.core.windows.net/;FileEndpoint=https://${account.name}.file.core.windows.net/;`;
        }

        return `DefaultEndpointsProtocol=https;AccountName=${account.name};AccountKey=${storageKey};${endpoints}`;
    }

    private async loadSubscriptionNodes(subscriptions: AzureSubscription[]): Promise<SubscriptionTreeItem[]> {
        
        const results = await Promise.all(subscriptions.map(async s => {

            try {
                const storageManagementClient = new StorageManagementClient(s.session.credentials2, s.subscription.subscriptionId);

                // Trying to load all storage account names in this subscription.
                // We need that list of names to subsequently match storage account nodes with their subscription nodes.
                const storageAccounts = await this.tryLoadingStorageAccountsForSubscription(storageManagementClient);

                // Now let's try to detect and load TaskHubs in this subscription.
                // Many things can go wrong there, that is why we're doing it so asynchronously
                this.tryLoadingTaskHubsForSubscription(storageManagementClient, storageAccounts)
                    .then(anyMoreTaskHubsAdded => {
                        if (anyMoreTaskHubsAdded) {
                            this._onStorageAccountsChanged();
                        }
                    }, err => { 
                        this._onStorageAccountsChanged();
                        this._log(`Failed to load TaskHubs from subscription ${s.subscription.displayName}. ${err.message}`);
                    });

                return {
                    subscriptionId: s.subscription.subscriptionId,
                    subscriptionName: s.subscription.displayName,
                    storageAccountNames: storageAccounts.map(a => a.name!)
                };

            } catch (err) {

                this._log(`Failed to load storage accounts from subscription ${s.subscription.displayName}. ${(err as any).message}`);

                return null;
            }
        }));

        return results
            .filter(r => r !== null)
            .map(r => new SubscriptionTreeItem(
                r!.subscriptionName,
                this._storageAccounts,
                r!.storageAccountNames,
                this._resourcesFolderPath
            ));
    }
}