// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import axios from 'axios';

import { BackendProcess } from '../../BackendProcess';
import { StorageConnectionSettings } from "../../StorageConnectionSettings";
import { Settings, UpdateSetting } from "../../Settings";

suite('BackendProcess Test Suite', () => {

	const testTimeoutInMs = 180000;

	test('Throws when backend process fails due to invalid connection string', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder('dotnetIsolated');

		const connSettings = new StorageConnectionSettings('my-invalid-conn-string', 'my-task-hub');

		var callbackWasCalled = false;
		var callbackWasCalledTwice = false;
		var backendWasStarted = false;
		var backendWasPublished = false;

		const callbackFunc = () => {

			if (!!callbackWasCalled) {
				callbackWasCalledTwice = true;
			}

			callbackWasCalled = true;
		};

		const logFunc = (s: string) => { 

			console.log(s);

			if (`Attempting to start the backend from ${tempBackendFolder} on http://localhost:37072/a/p/i...` === s) {
				backendWasStarted = true;
			}

			if (/(MSBuild|Microsoft \(R\) Build Engine) version /i.test(s)) {
				backendWasPublished = true;
			}
		};

		await UpdateSetting('customPathToBackendBinaries', tempBackendFolder);

		// Act

		try {

			const backendProcess = new BackendProcess('', connSettings, callbackFunc, () => Promise.resolve(), logFunc);

			// Calling getBackend() twice. It should return the same promise.
			try {
				
				await backendProcess.getBackend();
				
			} catch (err) {

				await backendProcess.getBackend();
			}

		} catch (err: any) {

			// Assert

			assert.strictEqual(err.message?.startsWith(`Func: Value cannot be null. (Parameter 'provider')`), true);

			assert.strictEqual(backendWasPublished, true);
			assert.strictEqual(callbackWasCalled, true);
			assert.strictEqual(callbackWasCalledTwice, false);
			assert.strictEqual(backendWasStarted, true);

			return;

		} finally {

			await UpdateSetting('customPathToBackendBinaries', undefined);

			// Wait a bit, before removing backend binaries
			await new Promise<void>((resolve) => setTimeout(resolve, 800));

			await fs.promises.rm(tempBackendFolder, { recursive: true });
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

	test('Throws when backend process fails due to invalid SqlServer connection string', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder('mssql');

		const connSettings = new StorageConnectionSettings('Data Source=my-server;Initial Catalog=my-db;Integrated Security=True;', 'my-task-hub');

		var callbackWasCalled = false;
		var callbackWasCalledTwice = false;
		var backendWasStarted = false;
		var backendWasPublished = false;

		const callbackFunc = () => {

			if (!!callbackWasCalled) {
				callbackWasCalledTwice = true;
			}

			callbackWasCalled = true;
		};

		const logFunc = (s: string) => { 

			console.log(s);

			if (`Attempting to start the backend from ${tempBackendFolder} on http://localhost:37072/a/p/i...` === s) {
				backendWasStarted = true;
			}

			if (/(MSBuild|Microsoft \(R\) Build Engine) version /i.test(s)) {
				backendWasPublished = true;
			}
		};

		await UpdateSetting('customPathToBackendBinaries', tempBackendFolder);

		// Act

		const backendProcess = new BackendProcess('', connSettings, callbackFunc, () => Promise.resolve(), logFunc);

		try {

			// Calling getBackend() twice. It should return the same promise.
			try {
				
				await backendProcess.getBackend();
				
			} catch (err) {

				await backendProcess.getBackend();
			}

		} catch (err: any) {

			// Assert

			// Backend should return 401 from its ping endpoint, due to invalid Task Hub name
			assert.strictEqual(err.message, `Backend responded with 401 Unauthorized. This might happen when specifying a non-existent Task Hub name.`);

			assert.strictEqual(backendWasPublished, true);
			assert.strictEqual(callbackWasCalled, true);
			assert.strictEqual(callbackWasCalledTwice, false);
			assert.strictEqual(backendWasStarted, true);

			return;

		} finally {

			await UpdateSetting('customPathToBackendBinaries', undefined);

			await backendProcess.cleanup();

			// Wait a bit, before removing backend binaries
			await new Promise<void>((resolve) => setTimeout(resolve, 500));

			await fs.promises.rm(tempBackendFolder, { recursive: true });
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

	test('Waits for the backend to start and throws after the predefined timeout', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder('mssql');

		const connSettings = new StorageConnectionSettings('Data Source=my-server;Initial Catalog=my-db;Integrated Security=True;', 'my-task-hub');

		var callbackWasCalled = false;
		var callbackWasCalledTwice = false;
		var backendWasStarted = false;
		var backendWasPublished = false;

		const callbackFunc = () => {

			if (!!callbackWasCalled) {
				callbackWasCalledTwice = true;
			}

			callbackWasCalled = true;
		};

		const logFunc = (s: string) => { 

			console.log(s);

			if (`Attempting to start the backend from ${tempBackendFolder} on http://localhost:37072/a/p/i...` === s) {
				backendWasStarted = true;
			}

			if (/(MSBuild|Microsoft \(R\) Build Engine) version /i.test(s)) {
				backendWasPublished = true;
			}
		};

		const oldAxiosGet = axios.get;
		(axios as any).get = (url: string) => {
			
			return Promise.reject(new Error());
		}

		const backendTimeoutInSeconds = 8;
		const previousBackendTimeoutInSeconds = Settings().backendTimeoutInSeconds;
		await UpdateSetting('backendTimeoutInSeconds', backendTimeoutInSeconds);

		await UpdateSetting('customPathToBackendBinaries', tempBackendFolder);
		
		// Act

		const backendProcess = new BackendProcess('', connSettings, callbackFunc, () => Promise.resolve(), logFunc);

		try {

			await backendProcess.getBackend();
				
		} catch (err: any) {

			// Assert

			assert.strictEqual(err.message, `No response within ${backendTimeoutInSeconds} seconds. Ensure you have the latest Azure Functions Core Tools installed globally.`);

			assert.strictEqual(backendWasPublished, true);
			assert.strictEqual(callbackWasCalled, true);
			assert.strictEqual(callbackWasCalledTwice, false);
			assert.strictEqual(backendWasStarted, true);

			return;

		} finally {

			await UpdateSetting('customPathToBackendBinaries', undefined);

			(axios as any).get = oldAxiosGet;
			await UpdateSetting('backendTimeoutInSeconds', previousBackendTimeoutInSeconds);

			await backendProcess.cleanup();

			// Wait a bit, before removing backend binaries
			await new Promise<void>((resolve) => setTimeout(resolve, 500));

			await fs.promises.rm(tempBackendFolder, { recursive: true });
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

	test('Throws on invalid backend binaries folder', async () => {

		// Arrange

		const nonExistingFolder = path.join(__dirname, 'non-existing-folder');
		const connSettings = new StorageConnectionSettings('my-invalid-conn-string', 'my-task-hub');

		// Act

		try {

			const backendProcess = new BackendProcess(nonExistingFolder, connSettings, () => {}, () => Promise.resolve(), () => {});

			await backendProcess.getBackend();

		} catch (err: any) {

			// Assert

			assert.strictEqual(err.message, `Couldn't find backend binaries in ${path.join(nonExistingFolder, 'backend')}`);

			return;
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

	test('Prepares environment variables for default backend', () => {

		// Arrange

		const connSettings = new StorageConnectionSettings('AccountName=mystorageaccount1;AccountKey=12345;DefaultEndpointsProtocol=http', 'my-task-hub');

		const backendProcess = new BackendProcess('', connSettings, () => { }, () => Promise.resolve(), () => { });

		// Act

		const env = (backendProcess as any).getEnvVariables();

		// Assert

		assert.strictEqual((!!env.Path) || (!!env.PATH), true);

		assert.strictEqual(env.DFM_NONCE, (backendProcess as any)._backendCommunicationNonce);
		assert.strictEqual(env.AzureWebJobsSecretStorageType, 'files');

		assert.strictEqual(env.AzureWebJobsStorage, connSettings.storageConnString);
		assert.strictEqual(!env.DFM_HUB_NAME, true);
		assert.strictEqual(!env.AzureWebJobsStorage__accountName, true);
		assert.strictEqual(!env.DFM_SQL_CONNECTION_STRING, true);
	});

	test('Prepares environment variables for SQL backend', () => {

		// Arrange

		const connSettings = new StorageConnectionSettings('Data Source=my-server;Initial Catalog=my-db;Integrated Security=True;', 'my-task-hub');

		const backendProcess = new BackendProcess('', connSettings, () => { }, () => Promise.resolve(), () => { });

		// Act

		const env = (backendProcess as any).getEnvVariables();

		// Assert

		assert.strictEqual((!!env.Path) || (!!env.PATH), true);

		assert.strictEqual(env.DFM_NONCE, (backendProcess as any)._backendCommunicationNonce);
		assert.strictEqual(env.AzureWebJobsSecretStorageType, 'files');

		assert.strictEqual(env.DFM_SQL_CONNECTION_STRING, connSettings.storageConnString);
		assert.strictEqual(env.DFM_HUB_NAME, connSettings.hubName);
		assert.strictEqual(!env.AzureWebJobsStorage, true);
		assert.strictEqual(!env.AzureWebJobsStorage__accountName, true);
	});	

	test('Prepares environment variables for identity-based backend', () => {

		// Arrange

		const connSettings = new StorageConnectionSettings(`AccountName=mystorageaccount1;DefaultEndpointsProtocol=http;`, 'my-task-hub');

		const backendProcess = new BackendProcess('', connSettings, () => { }, () => Promise.resolve(), () => { });

		// Act

		const env = (backendProcess as any).getEnvVariables();

		// Assert

		assert.strictEqual((!!env.Path) || (!!env.PATH), true);

		assert.strictEqual(env.DFM_NONCE, (backendProcess as any)._backendCommunicationNonce);
		assert.strictEqual(env.AzureWebJobsSecretStorageType, 'files');

		assert.strictEqual(env.AzureWebJobsStorage__accountName, 'mystorageaccount1');
		assert.strictEqual(!env.AzureWebJobsStorage, true);
		assert.strictEqual(!env.DFM_SQL_CONNECTION_STRING, true);
		assert.strictEqual(!env.DFM_HUB_NAME, true);
	});		

	test('Uses correct custom backend binaries', async () => {

		// Arrange

		const extensionPath = path.join(__dirname, '..', '..', '..');

		const connSettings = new StorageConnectionSettings(`AccountName=mystorageaccount1;AccountKey=12345;DefaultEndpointsProtocol=http;`, 'my-task-hub');

		const backendProcess = new BackendProcess(extensionPath, connSettings, () => { }, () => Promise.resolve(), () => { });

		await UpdateSetting('backendVersionToUse', '.Net Core 3.1');

		// Act

		try {

			const binariesFolder = await (backendProcess as any).getAndCheckBinariesFolder();

			// Assert

			assert.strictEqual(binariesFolder, path.join(extensionPath, 'custom-backends', 'netcore31'));

		} finally {

			await UpdateSetting('backendVersionToUse', undefined);
		}
	});

	test('Throws on older Functions version', async () => {

		// Arrange

		const extensionPath = path.join(__dirname, '..', '..', '..');

		const connSettings = new StorageConnectionSettings(`AccountName=mystorageaccount1;AccountKey=12345;DefaultEndpointsProtocol=http;`, 'my-task-hub');

		const backendProcess = new BackendProcess(extensionPath, connSettings, () => { }, () => Promise.resolve(), () => { });

		(BackendProcess as any)._funcVersion = '3.4.5';

		// Act

		try {

			await (backendProcess as any).getAndCheckBinariesFolder();

		} catch(err: any) {

			// Assert

			assert.strictEqual(err.message.startsWith(`Default backend now requires at least Azure Functions Core Tools v4.0.4629`), true);
		}
	});
});

async function copyBackendProjectToTempFolder(customBackendName: string): Promise<string>{

	const sourceFolder = path.join(__dirname, '..', '..', '..', '..', 'custom-backends', customBackendName);
	const resultFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dfm-backend-'));

	const prms = (await fs.promises.readdir(sourceFolder)).map(async fileName => {

		const fullPath = path.join(sourceFolder, fileName);

		if (!!(await fs.promises.lstat(fullPath)).isFile()) {

			await fs.promises.copyFile(fullPath, path.join(resultFolder, fileName));
		}
	});
	await Promise.all(prms);

	return resultFolder;
}

