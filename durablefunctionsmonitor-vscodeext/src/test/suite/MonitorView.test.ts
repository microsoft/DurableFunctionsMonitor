// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

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

		const webViewPanel: vscode.WebviewPanel = (monitorView as any)._webViewPanel;

		// Checking links
		const html = webViewPanel.webview.html;

		const linkToManifestJson = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(backend.binariesFolder, 'DfmStatics', 'manifest.json')));
		assert.strictEqual(html.includes(`href="${linkToManifestJson}"`), true);

		const linkToFavicon = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(backend.binariesFolder, 'DfmStatics', 'favicon.png')));
		assert.strictEqual(html.includes(`href="${linkToFavicon}"`), true);

		const cssFolder = path.join(backend.binariesFolder, 'DfmStatics', 'static', 'css');
		for (const fileName of await fs.promises.readdir(cssFolder)) {

			if (path.extname(fileName).toLowerCase() === '.css') {

				const linkToCss = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(cssFolder, fileName)));
				assert.strictEqual(html.includes(`href="${linkToCss}"`), true);
			}
		}

		const jsFolder = path.join(backend.binariesFolder, 'DfmStatics', 'static', 'js');
		for (const fileName of await fs.promises.readdir(jsFolder)) {

			if ( !fileName.startsWith('runtime-main.') && path.extname(fileName).toLowerCase() === '.js') {

				const linkToJs = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(jsFolder, fileName)));
				assert.strictEqual(html.includes(`src="${linkToJs}"`), true);
			}
		}

		monitorView.cleanup();

	}).timeout(testTimeoutInMs);

});
