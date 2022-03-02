// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { MonitorView } from './MonitorView';
import { FunctionGraphList, TraversalResult } from './FunctionGraphList';

// Represents the function graph view
export class FunctionGraphView
{
    constructor(private _context: vscode.ExtensionContext,
        private _functionProjectPath: string,
        private _functionGraphList: FunctionGraphList) {
        
        this._staticsFolder = path.join(this._context.extensionPath, 'backend', 'DfmStatics');

        this._webViewPanel = this.showWebView();
    }

    // Closes this web view
    cleanup(): void {

        if (!!this._webViewPanel) {
            this._webViewPanel.dispose();
        }
    }

    // Path to html statics
    private _staticsFolder: string;

    // Reference to the already opened WebView with the main page
    private _webViewPanel: vscode.WebviewPanel | null = null;    

    // Functions and proxies currently shown
    private _traversalResult?: TraversalResult;

    private static readonly ViewType = 'durableFunctionsMonitorFunctionGraph';

    // Opens a WebView with function graph page in it
    private showWebView(): vscode.WebviewPanel {

        const title = `Functions Graph (${this._functionProjectPath})`;

        const panel = vscode.window.createWebviewPanel(
            FunctionGraphView.ViewType,
            title,
            vscode.ViewColumn.One,
            {
                retainContextWhenHidden: true,
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(this._staticsFolder)]
            }
        );

        var html = fs.readFileSync(path.join(this._staticsFolder, 'index.html'), 'utf8');
        html = MonitorView.fixLinksToStatics(html, this._staticsFolder, panel.webview);

        html = this.embedTheme(html);
        html = this.embedParams(html, !!this._functionProjectPath);

        panel.webview.html = html;

        // handle events from WebView
        panel.webview.onDidReceiveMessage(request => this.handleMessageFromWebView(panel.webview, request), undefined, this._context.subscriptions);
        
        return panel;
    }

    // Embeds the current color theme
    private embedTheme(html: string): string {

        if ([2, 3].includes((vscode.window as any).activeColorTheme.kind)) {
            return html.replace('<script>var DfmClientConfig={}</script>', '<script>var DfmClientConfig={\'theme\':\'dark\'}</script>');
        }
        return html;
    }

    // Embeds some other parameters in the HTML served
    private embedParams(html: string, isFunctionGraphAvailable: boolean): string {
        return html
            .replace(
                `<script>var IsFunctionGraphAvailable=0</script>`,
                `<script>var IsFunctionGraphAvailable=${!!isFunctionGraphAvailable ? 1 : 0}</script>`
            )
            .replace(
                `<script>var DfmViewMode=0</script>`,
                `<script>var DfmViewMode=1</script>`
            );
    }

    // Does communication between code in WebView and this class
    private handleMessageFromWebView(webView: vscode.Webview, request: any): void {

        switch (request.method) {
            case 'SaveAs':

                // Just to be extra sure...
                if (!MonitorView.looksLikeSvg(request.data)) {
                    vscode.window.showErrorMessage(`Invalid data format. Save failed.`);
                    return;
                }
                
                // Saving some file to local hard drive
                vscode.window.showSaveDialog({ filters: { 'SVG Images': ['svg'] } }).then(filePath => {

                    if (!filePath || !filePath.fsPath) { 
                        return;
                    }

                    fs.writeFile(filePath!.fsPath, request.data, err => {
                        if (!err) {
                            vscode.window.showInformationMessage(`Saved to ${filePath!.fsPath}`);
                        } else {
                            vscode.window.showErrorMessage(`Failed to save. ${err}`);
                        }
                    });
                });
                return;
            
            case 'SaveFunctionGraphAsJson':

                if (!this._traversalResult) {
                    return;
                }
                
                // Saving some file to local hard drive
                vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file('dfm-func-map.json'), filters: { 'JSON': ['json'] } }).then(filePath => {

                    if (!filePath || !filePath.fsPath) { 
                        return;
                    }

                    fs.writeFile(filePath!.fsPath, JSON.stringify(this._traversalResult, null, 3), err => {
                        if (!err) {
                            vscode.window.showInformationMessage(`Saved to ${filePath!.fsPath}`);
                        } else {
                            vscode.window.showErrorMessage(`Failed to save. ${err}`);
                        }
                    });
                });
                return;
            
            case 'GotoFunctionCode':

                if (!this._traversalResult) {
                    return;
                }

                const functionName = request.url;
                var functionOrProxy: any = null;

                if (functionName.startsWith('proxy.')) {
            
                    functionOrProxy = this._traversalResult.proxies[functionName.substr(6)];
    
                } else {
    
                    functionOrProxy = this._traversalResult.functions[functionName];
                }
    
                vscode.window.showTextDocument(vscode.Uri.file(functionOrProxy.filePath)).then(ed => {

                    const pos = ed.document.positionAt(!!functionOrProxy.pos ? functionOrProxy.pos : 0);

                    ed.selection = new vscode.Selection(pos, pos);
                    ed.revealRange(new vscode.Range(pos, pos));

                });

                return;
        }

        // Intercepting request for Function Map
        if (request.method === "GET" && request.url === '/function-map') {

            if (!this._functionProjectPath) {
                return;
            }

            const requestId = request.id;
            this._functionGraphList.traverseFunctions(this._functionProjectPath).then(result => {

                this._traversalResult = result;

                webView.postMessage({
                    id: requestId, data: {
                        functions: result.functions,
                        proxies: result.proxies
                    }
                });

            }, err => {
                // err might fail to serialize here, so passing err.message only
                webView.postMessage({ id: requestId, err: { message: err.message } });
            });
        }
    }
}