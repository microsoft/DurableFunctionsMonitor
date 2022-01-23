// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

import { BackendProcess, StorageConnectionSettings } from '../../BackendProcess';

suite('BackendProcess Test Suite', () => {

	test('Throws when backend process fails due to invalid connection string', async () => {

		// Arrange

		const tempBackendFolder = await copyBackendProjectToTempFolder();

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

			const process = new BackendProcess(tempBackendFolder, connSettings, callbackFunc, logFunc);

			// Calling getBackend() twice. It should return the same promise.
			try {
				
				await process.getBackend();
				
			} catch (err) {

				await process.getBackend();
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
			await new Promise<void>((resolve) => setTimeout(resolve, 500));

			await fs.promises.rm(tempBackendFolder, { recursive: true });
		}

		throw `BackendProcess didn't throw as expected`;

	}).timeout(30000);
});

async function copyBackendProjectToTempFolder(): Promise<string>{

	const customBackendFolder = path.join(__dirname, '..', '..', '..', '..', 'custom-backends', 'netcore31');
	const resultFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dfm-backend-'));

	const prms = (await fs.promises.readdir(customBackendFolder)).map(async fileName => {

		const fullPath = path.join(customBackendFolder, fileName);

		if (!!(await fs.promises.lstat(fullPath)).isFile()) {

			await fs.promises.copyFile(fullPath, path.join(resultFolder, fileName));
		}
	});
	await Promise.all(prms);

	return resultFolder;
}

