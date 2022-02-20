// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { MonitorViewList } from '../../MonitorViewList';
import { MonitorView } from '../../MonitorView';
import { Settings } from "../../Settings";
import * as SharedConstants from '../../SharedConstants';
import axios from 'axios';
import { BackendProcess } from '../../BackendProcess';

suite('MonitorViewList Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Creates the MonitorView', async () => {

		// Arrange

		const context: any = {
			extensionPath: path.join(__dirname, '..', '..', '..')
		};

		const functionGraphList: any = {};
		const onViewStatusChanged = () => { };

		const monitorViewList = new MonitorViewList(context, functionGraphList, onViewStatusChanged, () => { });

		(vscode.window as any).showInputBox = () => Promise.resolve('UseDevelopmentStorage=true');

		var showWasCalled = false;
		var hideWasCalled = false;

		var onDidChangeValueHandler = (hubName: string) => { };
		var onDidAcceptHandler = () => { };

		const hubPick: any = {

			onDidHide: (handler: any) => { 

				console.log(handler)
			},

			onDidChangeSelection: (handler: any) => { 

				console.log(handler)
			},

			onDidChangeValue: (handler: any) => { 
				onDidChangeValueHandler = handler;
			},

			onDidAccept: (handler: any) => {
				onDidAcceptHandler = handler;
			},

			show: () => {
				showWasCalled = true;
			},
			hide: () => {
				hideWasCalled = true;
			}
		};

		(vscode.window as any).createQuickPick = () => hubPick;

		const taskHubNames = ['my-hub-1', 'my-hub-2'];
		const tableNames = ['some-other-table-1'];
		tableNames.push(...taskHubNames.map(n => n + 'Instances'));
		tableNames.push('some-other-table-2');
		tableNames.push(...taskHubNames.map(n => n + 'History'));
		tableNames.push('some-other-table-3');

		const prevAxiosGet = axios.get;
		(axios as any).get = (url: string, options: any) => {

			assert.strictEqual(url, 'http://127.0.0.1:10002/devstoreaccount1/Tables');
			assert.strictEqual(options.headers.Accept, 'application/json;odata=nometadata');
			assert.strictEqual(options.headers.Authorization.startsWith('SharedKeyLite devstoreaccount1:'), true);

			return Promise.resolve({
				data: {
					value: tableNames.map(n => { return { TableName: n }; })
				}
			});
		}

		// Act

		var monitorView: MonitorView;
		try {

			const monitorViewPromise = monitorViewList.getOrAdd(true);

			await new Promise<void>((resolve) => setTimeout(resolve, 100));

			// Typing in a Task Hub name
			onDidChangeValueHandler(taskHubNames[1]);
			onDidAcceptHandler();

			monitorView = await monitorViewPromise;
			
		} finally {
			
			(axios as any).get = prevAxiosGet;
		}

		// Assert

		assert.strictEqual(showWasCalled, true);
		assert.strictEqual(hideWasCalled, true);

		assert.strictEqual((monitorView as any).taskHubFullTitle, `devstoreaccount1/${taskHubNames[1]}`);
		assert.strictEqual(monitorView.storageConnectionSettings.hashKey, `http://127.0.0.1:10002/devstoreaccount1${taskHubNames[1]}`);
		assert.strictEqual(monitorView.storageConnectionSettings.storageConnStrings.length, 1);
		assert.strictEqual(monitorView.storageConnectionSettings.storageConnStrings[0], Settings().storageEmulatorConnectionString);

		const backend: BackendProcess = (monitorView as any)._backend;

		assert.strictEqual(backend.binariesFolder, path.join(context.extensionPath, 'backend'));

	}).timeout(testTimeoutInMs);

});
