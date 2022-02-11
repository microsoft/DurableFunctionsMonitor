// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

import { BackendProcess } from '../../BackendProcess';
import { StorageConnectionSettings } from "../../StorageConnectionSettings";

suite('BackendProcess Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Throws when backend process fails due to invalid connection string', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder('netcore31');

		const connSettings = new StorageConnectionSettings(['my-invalid-conn-string'], 'my-task-hub');

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

			if (s.startsWith('Microsoft (R) Build Engine version ')) {
				backendWasPublished = true;
			}
		};

		// Act

		try {

			const backendProcess = new BackendProcess(tempBackendFolder, connSettings, callbackFunc, logFunc);

			// Calling getBackend() twice. It should return the same promise.
			try {
				
				await backendProcess.getBackend();
				
			} catch (err) {

				await backendProcess.getBackend();
			}

		} catch (err) {

			// Assert

			assert.strictEqual(err, `Func: Value cannot be null. (Parameter 'provider')\r\n`);

			assert.strictEqual(backendWasPublished, true);
			assert.strictEqual(callbackWasCalled, true);
			assert.strictEqual(callbackWasCalledTwice, false);
			assert.strictEqual(backendWasStarted, true);

			return;

		} finally {

			// Wait a bit, before removing backend binaries
			await new Promise<void>((resolve) => setTimeout(resolve, 800));

			await fs.promises.rm(tempBackendFolder, { recursive: true });
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

	test('Throws when backend process fails due to invalid SqlServer connection string', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder('mssql');

		const connSettings = new StorageConnectionSettings(['Data Source=my-server;Initial Catalog=my-db;Integrated Security=True;'], 'my-task-hub');

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

			if (s.startsWith('Microsoft (R) Build Engine version ')) {
				backendWasPublished = true;
			}
		};

		// Act

		const backendProcess = new BackendProcess(tempBackendFolder, connSettings, callbackFunc, logFunc);

		try {

			// Calling getBackend() twice. It should return the same promise.
			try {
				
				await backendProcess.getBackend();
				
			} catch (err) {

				await backendProcess.getBackend();
			}

		} catch (err) {

			// Assert

			// Backend should return 401 from its ping endpoint, due to invalid Task Hub name
			assert.strictEqual(err, `Request failed with status code 401`);

			assert.strictEqual(backendWasPublished, true);
			assert.strictEqual(callbackWasCalled, true);
			assert.strictEqual(callbackWasCalledTwice, false);
			assert.strictEqual(backendWasStarted, true);

			return;

		} finally {

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
		const connSettings = new StorageConnectionSettings(['my-invalid-conn-string'], 'my-task-hub');

		// Act

		try {

			const backendProcess = new BackendProcess(nonExistingFolder, connSettings, () => {}, () => {});

			await backendProcess.getBackend();

		} catch (err) {

			// Assert

			assert.strictEqual(err, `Couldn't find backend binaries in ${nonExistingFolder}`);

			return;
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(testTimeoutInMs);

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

