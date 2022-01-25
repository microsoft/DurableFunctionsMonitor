// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';

import { MonitorView } from '../../MonitorView';
import { Settings } from "../../Settings";

suite('MonitorView Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Shows the WebView', async () => {

		// Arrange

		const context: any = {

			globalState: {
				get: () => {}
			}
		};

		const backend: any = {

			getBackend: () => Promise.resolve(),

			storageConnectionStrings: [
				Settings().storageEmulatorConnectionString
			],

			binariesFolder: path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend')
		};

		const functionGraphList: any = {};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		// Act

		await monitorView.show();

		// Assert

		assert.strictEqual(monitorView.isVisible, true);

		monitorView.cleanup();

	}).timeout(testTimeoutInMs);

});
