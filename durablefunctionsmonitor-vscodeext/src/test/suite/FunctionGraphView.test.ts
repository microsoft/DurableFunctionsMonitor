// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

import { FunctionGraphView } from '../../FunctionGraphView';

suite('FunctionGraphView Test Suite', () => {

	const testTimeoutInMs = 60000;

	test('Shows the WebView', async () => {

		// Arrange

		const context: any = {

			extensionPath: path.join(__dirname, '..', '..', '..')
		};

		const functionProjectPath = path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend');
		
		const functionGraphList: any = {};

		// Act

		const functionGraphView = new FunctionGraphView(context, functionProjectPath, functionGraphList);

		// Assert

		const webViewPanel: vscode.WebviewPanel = (functionGraphView as any)._webViewPanel;

		const html = webViewPanel.webview.html;

		const dfmViewModeScript = `<script>var DfmViewMode=1</script>`;
		assert.strictEqual(html.includes(dfmViewModeScript), true);

		const isFunctionGraphAvailableScript = `<script>var IsFunctionGraphAvailable=1</script>`;
		assert.strictEqual(html.includes(isFunctionGraphAvailableScript), true);

		// Checking links
		const linkToManifestJson = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'backend', 'DfmStatics', 'manifest.json')));
		assert.strictEqual(html.includes(`href="${linkToManifestJson}"`), true);

		const linkToFavicon = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'backend', 'DfmStatics', 'favicon.png')));
		assert.strictEqual(html.includes(`href="${linkToFavicon}"`), true);

		const cssFolder = path.join(context.extensionPath, 'backend', 'DfmStatics', 'static', 'css');
		for (const fileName of await fs.promises.readdir(cssFolder)) {

			if (path.extname(fileName).toLowerCase() === '.css') {

				const linkToCss = webViewPanel.webview.asWebviewUri(vscode.Uri.file(path.join(cssFolder, fileName)));
				assert.strictEqual(html.includes(`href="${linkToCss}"`), true);
			}
		}

		const jsFolder = path.join(context.extensionPath, 'backend', 'DfmStatics', 'static', 'js');
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

		functionGraphView.cleanup();

		assert.strictEqual(webViewPanelDisposed, true);

	}).timeout(testTimeoutInMs);

	test('Handles SaveAs', async () => {

		// Arrange

		const context: any = {

			extensionPath: path.join(__dirname, '..', '..', '..')
		};

		const functionProjectPath = path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend');

		const functionGraphList: any = {
			traverseFunctions: () => Promise.resolve({
				functions: {},
				proxies: {}
			})
		};
		const webView: any = {};

		const svgFileName = `dfm-test-svg-${new Date().valueOf().toString()}.svg`;
		const svgFilePath = path.join(os.tmpdir(), svgFileName);

		const request: any = {

			method: 'SaveAs',
			data: `<svg id="${svgFileName}"></svg>`
		};

		const functionGraphView = new FunctionGraphView(context, functionProjectPath, functionGraphList);

		(vscode.window as any).showSaveDialog = (options: vscode.SaveDialogOptions) => {

			const filters = options.filters!;
			assert.strictEqual(filters['SVG Images'].length, 1);
			assert.strictEqual(filters['SVG Images'][0], 'svg');

			return Promise.resolve({ fsPath: svgFilePath });
		};

		// Act

		(functionGraphView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		// Assert

		const svg = await fs.promises.readFile(svgFilePath, { encoding: 'utf8' });

		await fs.promises.rm(svgFilePath);

		assert.strictEqual(svg, request.data);

	}).timeout(testTimeoutInMs);

	test('Handles GET /function-map', async () => {

		// Arrange

		const context: any = {

			extensionPath: path.join(__dirname, '..', '..', '..')
		};

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

		const functionGraphList: any = {

			traverseFunctions: (projectPath: string) => {

				assert.strictEqual(projectPath, backendFolder);

				return Promise.resolve({ functions, proxies });
			}
		};

		const functionGraphView = new FunctionGraphView(context, backendFolder, functionGraphList);

		// Act

		(functionGraphView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		// Assert

		assert.strictEqual(responseMessagePosted, true);

		const projectPath = (functionGraphView as any)._functionProjectPath;
		assert.strictEqual(backendFolder, projectPath);

		const traversalResult = (functionGraphView as any)._traversalResult;
		assert.strictEqual(traversalResult.functions['my-func-1'], functions['my-func-1']);
		assert.strictEqual(traversalResult.functions['my-func-2'], functions['my-func-2']);

		assert.strictEqual(traversalResult.proxies['my-proxy-1'], proxies['my-proxy-1']);
		assert.strictEqual(traversalResult.proxies['my-proxy-2'], proxies['my-proxy-2']);

	}).timeout(testTimeoutInMs);
	
	test('Handles GotoFunctionCode', async () => {

		// Arrange

		const context: any = {

			extensionPath: path.join(__dirname, '..', '..', '..')
		};

		const webView: any = {};
		const functionGraphList: any = {};

		const request: any = {

			method: 'GotoFunctionCode',
			url: 'my-func-1'
		};

		const backendFolder = path.join(__dirname, '..', '..', '..', '..', 'durablefunctionsmonitor.dotnetbackend');

		const functionGraphView = new FunctionGraphView(context, backendFolder, functionGraphList);

		(functionGraphView as any)._traversalResult = { functions: {}, proxies: {} };
		(functionGraphView as any)._traversalResult.functions[request.url] = {
			filePath: path.join(backendFolder, 'Functions', 'ServeStatics.cs'),
			pos: 67
		};

		// Act

		(functionGraphView as any).handleMessageFromWebView(webView, request);

		await new Promise<void>((resolve) => setTimeout(resolve, 2000));

		// Assert

		const projectPath = (functionGraphView as any)._functionProjectPath;
		assert.strictEqual(backendFolder, projectPath);

		assert.strictEqual(1, vscode.window.activeTextEditor!.selection.start.line);
		assert.strictEqual(26, vscode.window.activeTextEditor!.selection.start.character);

	}).timeout(testTimeoutInMs);


});
