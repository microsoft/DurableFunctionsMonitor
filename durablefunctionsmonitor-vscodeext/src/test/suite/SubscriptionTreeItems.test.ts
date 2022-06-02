// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as path from 'path';
import * as assert from 'assert';
import axios from 'axios';

import { SubscriptionTreeItems } from '../../SubscriptionTreeItems';
import { StorageConnectionSettings, SequentialDeviceTokenCredentials } from '../../StorageConnectionSettings';

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

	test('Loads Task Hubs for a Subscription', async () => {

		// Arrange

		const context: any = {

			globalState: {
				get: () => { return true; }
			}
		};

		const token = {
			accessToken: 'my-token-1'
		};

		(SequentialDeviceTokenCredentials as any).executeSequentially = () => Promise.resolve(token);
			
		const subscription1 = {
			subscriptionId: '10000000-0000-0000-0000-000000000001',
			displayName: 'my-subscription-name-1',

			session: {
				credentials2: {
					environment: {
						name: 'AzureCloud',
						portalUrl: 'https://portal.azure.com',
						managementEndpointUrl: 'https://management.core.windows.net',
						resourceManagerEndpointUrl: 'https://management.azure.com/',
						activeDirectoryEndpointUrl: 'https://login.microsoftonline.com/'
					}
				}
			}
		};

		const azureAccount: any = {};

		const taskHubNames = ['my-hub-1', 'my-hub-2'];

		const resourceGroupName: string = 'my-rg';
		const storageKeyValue: string = 'my-key-value';

		const storageAccount1 = {
			id: `/subscriptions/10000000-0000-0000-0000-000000000001/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/my-storage-account-1`,
			name: 'my-storage-account-1'
		};

		const storageAccount2 = {
			id: `/subscriptions/20000000-0000-0000-0000-000000000002/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/my-storage-account-2`,
			name: 'my-storage-account-2'
		};

		let addNodeForConnectionSettingsCallCount = 0;

		const storageAccountTreeItems: any = {

			addNodeForConnectionSettings: (
				connSettings: StorageConnectionSettings,
				isV2StorageAccount: boolean,
				storageAccountId: string
			) => {

				addNodeForConnectionSettingsCallCount++;

				switch (storageAccountId) {
					case storageAccount1.id:

						assert.strictEqual(
							connSettings.storageConnStrings[0],
							`DefaultEndpointsProtocol=https;AccountName=${storageAccount1.name};BlobEndpoint=https://${storageAccount1.name}.blob.core.windows.net/;QueueEndpoint=https://${storageAccount1.name}.queue.core.windows.net/;TableEndpoint=https://${storageAccount1.name}.table.core.windows.net/;FileEndpoint=https://${storageAccount1.name}.file.core.windows.net/;`
						);
						
						break;
					case storageAccount2.id:

						assert.strictEqual(
							connSettings.storageConnStrings[0],
							`DefaultEndpointsProtocol=https;AccountName=${storageAccount2.name};BlobEndpoint=https://${storageAccount2.name}.blob.core.windows.net/;QueueEndpoint=https://${storageAccount2.name}.queue.core.windows.net/;TableEndpoint=https://${storageAccount2.name}.table.core.windows.net/;FileEndpoint=https://${storageAccount2.name}.file.core.windows.net/;`
						);
						
						break;
					default:
						
						assert.fail('invalid storageAccountId');
				}

				assert.strictEqual(taskHubNames.includes(connSettings.hubName), true);
				assert.strictEqual(connSettings.isIdentityBasedConnection, true);
			}
		};

		const resourcesFolder = path.join(__dirname, '..', '..', '..', 'resources');

		const storageManagementClient: any = {

			storageAccounts: {

				listKeys: (rgName: string, accName: string) => {

					assert.strictEqual(rgName, resourceGroupName);
					assert.strictEqual((accName === storageAccount1.name || accName === storageAccount2.name), true);

					return Promise.resolve({
						keys: [{
							value: storageKeyValue
						}]
					});
				}
			}
		};

		const items = new SubscriptionTreeItems(context, azureAccount, storageAccountTreeItems, () => { }, resourcesFolder, () => { });

		const tableNames = ['some-other-table-1'];
		tableNames.push(...taskHubNames.map(n => n + 'Instances'));
		tableNames.push('some-other-table-2');
		tableNames.push(...taskHubNames.map(n => n + 'History'));
		tableNames.push('some-other-table-3');

		let axiosGetCallCount = 0;

		const oldAxiosGet = axios.get;
		(axios as any).get = (url: string, options: any) => {

			axiosGetCallCount++;

			assert.strictEqual((url === `https://${storageAccount1.name}.table.core.windows.net/Tables` || url === `https://${storageAccount2.name}.table.core.windows.net/Tables`), true);

			assert.strictEqual(options.headers.Accept, 'application/json;odata=nometadata');

			// The code is expected to first try with storage key and receive a 403...
			if (!!options.headers.Authorization.startsWith('SharedKeyLite ')) {
				
				throw {	response: { status: 403 } };
			}

			// .. and then try with accessToken
			assert.strictEqual(options.headers.Authorization, `Bearer ${token.accessToken}`);

			return Promise.resolve({
				data: {
					value: tableNames.map(n => { return { TableName: n }; })
				}
			});
		}

		// Act

		try {

			await (items as any).tryLoadingTaskHubsForSubscription(storageManagementClient, [storageAccount1, storageAccount2], subscription1);
			
		} finally {

			(axios as any).get = oldAxiosGet;
		}

		// Assert

		assert.strictEqual(axiosGetCallCount, 4);
		assert.strictEqual(addNodeForConnectionSettingsCallCount, 4);
		
	}).timeout(testTimeoutInMs);
});
