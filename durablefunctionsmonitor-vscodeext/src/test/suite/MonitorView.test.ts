// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { MonitorView } from '../../MonitorView';
import { Settings } from "../../Settings";
import * as SharedConstants from '../../SharedConstants';
import axios from 'axios';

suite('MonitorView Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Shows the WebView', async () => {

		// Arrange

		const webViewState = {
			myKey: new Date().toISOString()
		};

		const context: any = {

			globalState: {
				get: () => webViewState
			}
		};

		const backend: any = {

			getBackend: () => Promise.resolve(),

			storageConnectionStrings: [
				Settings().storageEmulatorConnectionString
			],

			binariesFolder: path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend')
		};

		Object.defineProperty(vscode.workspace, 'rootPath', { get: () => backend.binariesFolder });
		
		const functionGraphList: any = {};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		var iAmReadyMessageSent = false;

		// Act

		await monitorView.show();

		// Assert

		const webViewPanel: vscode.WebviewPanel = (monitorView as any)._webViewPanel;

		(monitorView as any).handleMessageFromWebView = (webView: vscode.Webview, request: any, messageToWebView: any) => {

			if (webView === webViewPanel.webview && request.method === 'IAmReady') {
				iAmReadyMessageSent = true;
			}
		};

		// Waiting for the webView to send a message
		await new Promise<void>((resolve) => setTimeout(resolve, 1000));

		assert.strictEqual(monitorView.isVisible, true);
		assert.strictEqual(iAmReadyMessageSent, true);

		const html = webViewPanel.webview.html;

		// Checking embedded constants
		const stateFromVsCodeScript = `<script>var OrchestrationIdFromVsCode="",StateFromVsCode=${JSON.stringify(webViewState)}</script>`;
		assert.strictEqual(html.includes(stateFromVsCodeScript), true);

		const dfmClientConfigScript = `<script>var DfmClientConfig={'theme':'light','showTimeAs':'UTC'}</script>`;
		assert.strictEqual(html.includes(dfmClientConfigScript), true);

		const dfmViewModeScript = `<script>var DfmViewMode=0</script>`;
		assert.strictEqual(html.includes(dfmViewModeScript), true);

		const isFunctionGraphAvailableScript = `<script>var IsFunctionGraphAvailable=1</script>`;
		assert.strictEqual(html.includes(isFunctionGraphAvailableScript), true);

		// Checking links
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

		var webViewPanelDisposed = false;
		(webViewPanel as any).dispose = () => {
			webViewPanelDisposed = true;
		}

		monitorView.cleanup();

		assert.strictEqual(webViewPanelDisposed, true);

	}).timeout(testTimeoutInMs);

	test('Handles IAmReady', async () => {

		// Arrange

		const context: any = {};
		const backend: any = {};
		const functionGraphList: any = {};

		const msgToWebView = 'just-a-message';
		var msgWasSent = false;
		const webView: any = {

			postMessage: (msg: any) => {

				if (msg === msgToWebView) {
					msgWasSent = true;
				}
			}
		};

		const request: any = {

			method: 'IAmReady'
		};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request, msgToWebView);

		// Assert

		assert.strictEqual(msgWasSent, true);
	});	

	test('Handles PersistState', async () => {

		// Arrange

		const globalStateName = 'durableFunctionsMonitorWebViewState';
		const globalState = {
			someOtherField: new Date()
		};
		const stateFieldKey = 'my-field-key';
		const stateFieldValue = 'my-field-value';
		
		var stateWasUpdated = false;

		const context: any = {

			globalState: {

				get: (name: string) => {

					assert.strictEqual(name, globalStateName);

					return globalState;
				},

				update: (name: string, value: any) => {

					assert.strictEqual(name, globalStateName);
					assert.strictEqual(value.someOtherField, globalState.someOtherField);
					assert.strictEqual(value[stateFieldKey], stateFieldValue);

					stateWasUpdated = true;
				}
			}
		};

		const backend: any = {};
		const functionGraphList: any = {};
		const webView: any = {};

		const request: any = {
			method: 'PersistState',
			key: stateFieldKey,
			data: stateFieldValue
		};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		// Assert

		assert.strictEqual(stateWasUpdated, true);
	});	

	test('Handles OpenInNewWindow', async () => {

		// Arrange

		const globalState = {};
		
		const context: any = {

			globalState: {
				get: () => globalState
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
		const webView: any = {};

		const orchestrationId = new Date().toISOString();

		const request: any = {
			method: 'OpenInNewWindow',
			url: orchestrationId
		};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		// Assert

		const childWebViewPanels: vscode.WebviewPanel[] = (monitorView as any)._childWebViewPanels;

		assert.strictEqual(childWebViewPanels.length, 1);

		const viewPanel = childWebViewPanels[0];

		assert.strictEqual(viewPanel.title, `Instance '${orchestrationId}'`);

		const html = viewPanel.webview.html;
		const stateFromVsCodeScript = `<script>var OrchestrationIdFromVsCode="${orchestrationId}",StateFromVsCode={}</script>`;
		assert.strictEqual(html.includes(stateFromVsCodeScript), true);

	}).timeout(testTimeoutInMs);

	test('Handles SaveAs', async () => {

		// Arrange

		const context: any = {};
		const backend: any = {};
		const functionGraphList: any = {};
		const webView: any = {};

		const svgFileName = `dfm-test-svg-${new Date().valueOf().toString()}.svg`;
		const svgFilePath = path.join(os.tmpdir(), svgFileName);

		const request: any = {

			method: 'SaveAs',
			data: `<svg id="${svgFileName}"></svg>`
		};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		(vscode.window as any).showSaveDialog = (options: vscode.SaveDialogOptions) => {

			const filters = options.filters!;
			assert.strictEqual(filters['SVG Images'].length, 1);
			assert.strictEqual(filters['SVG Images'][0], 'svg');

			return Promise.resolve({ fsPath: svgFilePath });
		};

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		// Assert

		const svg = await fs.promises.readFile(svgFilePath, { encoding: 'utf8' });

		await fs.promises.rm(svgFilePath);

		assert.strictEqual(svg, request.data);

	}).timeout(testTimeoutInMs);

	test('Handles GotoFunctionCode', async () => {

		// Arrange

		const context: any = {};
		const backend: any = {};
		const webView: any = {};
		const functionGraphList: any = {};

		const request: any = {

			method: 'GotoFunctionCode',
			url: 'my-func-1'
		};

		const backendFolder = path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend');
		Object.defineProperty(vscode.workspace, 'rootPath', { get: () => backendFolder });

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		(monitorView as any)._functionsAndProxies[request.url] = {
			filePath: path.join(backendFolder, 'Functions', 'About.cs'),
			pos: 67
		};

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 500));

		// Assert

		const projectPath = (monitorView as any)._functionProjectPath;
		assert.strictEqual(backendFolder, projectPath);

		assert.strictEqual(1, vscode.window.activeTextEditor!.selection.start.line);
		assert.strictEqual(26, vscode.window.activeTextEditor!.selection.start.character);

	}).timeout(testTimeoutInMs);

	test('Handles GET /function-map', async () => {

		// Arrange

		const context: any = {};
		const backend: any = {};

		const request: any = {

			method: 'GET',
			url: '/function-map',
			id: new Date().toISOString()
		};

		const functions = {
			'my-func-1': {},
			'my-func-2': {},
		}

		const proxies = {
			'my-proxy-1': {},
			'my-proxy-2': {}
		}

		var responseMessagePosted = false;

		const webView: any = {

			postMessage: (msg: any) => {

				assert.strictEqual(msg.id, request.id);
				assert.strictEqual(msg.data.functions, functions);
				assert.strictEqual(msg.data.proxies, proxies);

				responseMessagePosted = true;
			}
		};

		const backendFolder = path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend');
		Object.defineProperty(vscode.workspace, 'rootPath', { get: () => backendFolder });

		const functionGraphList: any = {

			traverseFunctions: (projectPath: string) => {

				assert.strictEqual(projectPath, backendFolder);

				return Promise.resolve({ functions, proxies });
			}
		};

		const monitorView = new MonitorView(context, backend, 'my-hub', functionGraphList, () => { });

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		// Assert

		assert.strictEqual(responseMessagePosted, true);

		const projectPath = (monitorView as any)._functionProjectPath;
		assert.strictEqual(backendFolder, projectPath);

		const functionsAndProxies = (monitorView as any)._functionsAndProxies;

		assert.strictEqual(functionsAndProxies['my-func-1'], functions['my-func-1']);
		
	}).timeout(testTimeoutInMs);

	test('Handles HTTP requests', async () => {

		// Arrange

		const context: any = {};
		const functionGraphList: any = {};

		const backend: any = {

			backendUrl: 'http://localhost:12345',
			backendCommunicationNonce: `nonce-${new Date().valueOf()}`

		};
		const hubName = 'my-hub-4321';

		const monitorView = new MonitorView(context, backend, hubName, functionGraphList, () => { });

		const request: any = {

			id: new Date().toISOString(),
			method: 'OPTIONS',
			url: '/some/other/path',
			data: {
				fieldOne: 'value1'
			}
		};

		const responseData: any = {
			fieldTwo: 'value2'
		};

		var responseMessagePosted = false;

		const webView: any = {

			postMessage: (msg: any) => {

				assert.strictEqual(msg.id, request.id);
				assert.strictEqual(msg.data, responseData);

				responseMessagePosted = true;
			}
		};

		(axios as any).request = (r: any) => {

			assert.strictEqual(r.method, request.method);
			assert.strictEqual(r.url, `${backend.backendUrl}/--${hubName}${request.url}`);
			assert.strictEqual(r.data, request.data);
			assert.strictEqual(r.headers[SharedConstants.NonceHeaderName], backend.backendCommunicationNonce);

			return Promise.resolve({ data: responseData });
		};

		// Act

		(monitorView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		// Assert

		assert.strictEqual(responseMessagePosted, true);
		
	}).timeout(testTimeoutInMs);	

	test('Deletes Task Hub', async () => {

		// Arrange

		const context: any = {};
		const functionGraphList: any = {};

		const backend: any = {

			backendUrl: 'http://localhost:12345',
			backendCommunicationNonce: `nonce-${new Date().valueOf()}`

		};
		const hubName = 'my-hub-6789';

		const monitorView = new MonitorView(context, backend, hubName, functionGraphList, () => { });

		(axios as any).post = (url: string, data: any, config: any) => {

			assert.strictEqual(url, `${backend.backendUrl}/--${hubName}/delete-task-hub`);
			assert.strictEqual(config.headers[SharedConstants.NonceHeaderName], backend.backendCommunicationNonce);

			return Promise.resolve();
		};

		var webViewPanelDisposed = false;

		(monitorView as any)._webViewPanel = {
			dispose: () => {
				webViewPanelDisposed = true;
			}
		}

		// Act

		await monitorView.deleteTaskHub();

		// Assert

		assert.strictEqual(webViewPanelDisposed, true);
		
	}).timeout(testTimeoutInMs);

});
