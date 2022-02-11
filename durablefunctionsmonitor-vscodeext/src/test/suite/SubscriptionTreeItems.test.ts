// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from 'path';
import * as assert from 'assert';

import { SubscriptionTreeItems } from '../../SubscriptionTreeItems';

suite('SubscriptionTreeItems Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Returns the list of SubscriptionTreeItems', async () => {

		// Arrange

		const context: any = {};

		var waitedForAzureLogin = false;

		const subscription1 = {
			subscriptionId: 'my-subscription-id-1',
			displayName: 'my-subscription-name-1'
		};

		const subscription3 = {
			subscriptionId: 'my-subscription-id-3',
			displayName: 'my-subscription-name-3'
		};

		const azureAccount: any = {

			waitForFilters: () => {

				waitedForAzureLogin = true;

				return Promise.resolve(true);
			},

			filters: [
				{
					subscription: subscription1,

					session: {
						credentials2: {
							signRequest: () => {}
						}
					}
				},
				{
					subscription: subscription3,

					session: {
						credentials2: {
							signRequest: () => {}
						}
					}
				}
			]
		};

		const storageAccount1 = {
			name: 'my-storage-account-1'
		};

		const storageAccount2 = {
			name: 'my-storage-account-2'
		};

		const storageAccount3 = {
			name: 'my-storage-account-3'
		};

		const storageAccount4 = {
			name: 'my-storage-account-4'
		};

		const storageAccountTreeItems: any = {

			nodes: [
				{ storageName: storageAccount1.name },
				{ storageName: storageAccount2.name },
				{ storageName: storageAccount3.name },
				{ storageName: storageAccount4.name },
			]
		};

		const resourcesFolder = path.join(__dirname, '..', '..', '..', 'resources');

		const items = new SubscriptionTreeItems(context, azureAccount, storageAccountTreeItems, () => { }, resourcesFolder, () => { });
		(items as any).tryLoadingStorageAccountsForSubscription = (storageManagementClient: any) => {
			
			if (storageManagementClient.subscriptionId === subscription1.subscriptionId) {

				return Promise.resolve([storageAccount1, storageAccount2]);
				
			} else if (storageManagementClient.subscriptionId === subscription3.subscriptionId) {

				return Promise.resolve([storageAccount3]);				
			}
		}

		var taskHubsLoaded = false;
		(items as any).tryLoadingTaskHubsForSubscription = (storageManagementClient: any, storageAccounts: any[]) => {

			if (storageManagementClient.subscriptionId === subscription1.subscriptionId) {

				assert.strictEqual(storageAccounts.length, 2);
				assert.strictEqual(storageAccounts[0], storageAccount1);
				assert.strictEqual(storageAccounts[1], storageAccount2);
					
			} else if (storageManagementClient.subscriptionId === subscription3.subscriptionId) {

				assert.strictEqual(storageAccounts.length, 1);
				assert.strictEqual(storageAccounts[0], storageAccount3);
			}
			
			taskHubsLoaded = true;
			return Promise.resolve(true);
		}

		// Act

		const nodes = await items.getNonEmptyNodes();

		// Assert

		assert.strictEqual(waitedForAzureLogin, true);
		assert.strictEqual(taskHubsLoaded, true);

		assert.strictEqual(nodes.length, 3);

		const subscriptionNode1 = nodes[0];
		assert.strictEqual(subscriptionNode1.label, subscription1.displayName);
		assert.strictEqual(subscriptionNode1.iconPath, path.join(resourcesFolder, 'azureSubscription.svg'));

		assert.strictEqual(subscriptionNode1.storageAccountNodes.length, 2);
		assert.strictEqual(subscriptionNode1.storageAccountNodes[0], storageAccountTreeItems.nodes[0]);
		assert.strictEqual(subscriptionNode1.storageAccountNodes[1], storageAccountTreeItems.nodes[1]);

		const subscriptionNode3 = nodes[1];
		assert.strictEqual(subscriptionNode3.label, subscription3.displayName);
		assert.strictEqual(subscriptionNode3.iconPath, path.join(resourcesFolder, 'azureSubscription.svg'));

		assert.strictEqual(subscriptionNode3.storageAccountNodes.length, 1);
		assert.strictEqual(subscriptionNode3.storageAccountNodes[0], storageAccountTreeItems.nodes[2]);

		const defaultNode = nodes[2];
		assert.strictEqual(defaultNode.label, 'Storages');
		assert.strictEqual(defaultNode.iconPath, path.join(resourcesFolder, 'storageAccounts.svg'));

	}).timeout(testTimeoutInMs);

});
