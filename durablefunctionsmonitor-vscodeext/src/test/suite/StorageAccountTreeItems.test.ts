// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as assert from 'assert';

import { StorageAccountTreeItems } from '../../StorageAccountTreeItems';
import { MonitorView } from '../../MonitorView';
import { MonitorViewList } from '../../MonitorViewList';
import { FunctionGraphList } from '../../FunctionGraphList';

suite('StorageAccountTreeItems Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Adds nodes for MonitorView', async () => {

		// Arrange

		const context: any = {};

		const functionGraphList = new FunctionGraphList(context, undefined);
		const monitorViewList = new MonitorViewList(context, functionGraphList, () => { }, () => { });

		const resourcesFolderPath = '';

		const storageAccountTreeItems = new StorageAccountTreeItems(resourcesFolderPath, monitorViewList);

		const backend1: any = {	storageConnectionStrings: [`AccountName=mystorageaccount1;AccountKey=12345;DefaultEndpointsProtocol=http;`] };
		const backend2: any = { storageConnectionStrings: [`AccountName=mystorageaccount2;AccountKey=12345;DefaultEndpointsProtocol=http;`] };
		
		const hubName1 = 'my-hub-1';
		const hubName2 = 'my-hub-2';
		const hubName3 = 'my-hub-3';

		const monitorView1 = new MonitorView(context, backend1, hubName1, functionGraphList, () => { });
		const monitorView2 = new MonitorView(context, backend1, hubName2, functionGraphList, () => { });
		const monitorView3 = new MonitorView(context, backend2, hubName3, functionGraphList, () => { });

		// Act

		storageAccountTreeItems.addNodeForMonitorView(monitorView3);
		storageAccountTreeItems.addNodeForMonitorView(monitorView2);
		storageAccountTreeItems.addNodeForMonitorView(monitorView1);

		// Assert

		const storageAccountNodes = storageAccountTreeItems.nodes;

		assert.strictEqual(storageAccountNodes.length, 2);
		assert.strictEqual(storageAccountNodes[0].label, 'mystorageaccount1');
		assert.strictEqual(storageAccountNodes[1].label, 'mystorageaccount2');

		const taskHubItems1 = (storageAccountNodes[0] as any)._taskHubItems;
		const taskHubItems2 = (storageAccountNodes[1] as any)._taskHubItems;

		assert.strictEqual(taskHubItems1.length, 2);
		assert.strictEqual(taskHubItems1[0].label, hubName1);
		assert.strictEqual(taskHubItems1[1].label, hubName2);

		assert.strictEqual(taskHubItems2.length, 1);
		assert.strictEqual(taskHubItems2[0].label, hubName3);

	}).timeout(testTimeoutInMs);

});
