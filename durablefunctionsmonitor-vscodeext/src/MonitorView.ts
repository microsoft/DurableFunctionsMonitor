// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as open from 'open';
import { ResourceGraphClient } from '@azure/arm-resourcegraph';
import { DeviceTokenCredentials } from '@azure/ms-rest-nodeauth';

import * as SharedConstants from './SharedConstants';

import { BackendProcess } from './BackendProcess';
import { StorageConnectionSettings } from "./StorageConnectionSettings";
import { ConnStringUtils } from './ConnStringUtils';
import { Settings } from './Settings';
import { FunctionGraphList } from './FunctionGraphList';

export type AzureConnectionInfo = { credentials: DeviceTokenCredentials, subscriptionId: string, tenantId: string };

// Represents the main view, along with all detailed views
export class MonitorView
{
    // Storage Connection settings (connString and hubName) of this Monitor View
    get storageConnectionSettings(): StorageConnectionSettings {
        return new StorageConnectionSettings(this._backend.storageConnectionStrings, this._hubName);
    }

    get isVisible(): boolean {
        return !!this._webViewPanel;
    }

    // Path to html statics
    get staticsFolder(): string {
        return path.join(this._backend.binariesFolder, 'DfmStatics');
    }

    constructor(private _context: vscode.ExtensionContext,
        private _backend: BackendProcess,
        private _hubName: string,
        private _functionGraphList: FunctionGraphList,
        private _getTokenCredentialsForGivenConnectionString: (connString: string) => AzureConnectionInfo | undefined,
        private _onViewStatusChanged: () => void,
        private _log: (line: string) => void) {
        
        const ws = vscode.workspace;
        if (!!ws.rootPath && fs.existsSync(path.join(ws.rootPath, 'host.json'))) {
            this._functionProjectPath = ws.rootPath;
        }
    }

    // Closes all WebViews
    cleanup(): void {

        for (var childPanel of this._childWebViewPanels) {
            childPanel.dispose();
        }
        this._childWebViewPanels = [];

        if (!!this._webViewPanel) {
            this._webViewPanel.dispose();
        }
    }

    // Shows or makes active the main view
    async show(messageToWebView: any = undefined): Promise<void> {

        if (!!this._webViewPanel) {
            // Didn't find a way to check whether the panel still exists. 
            // So just have to catch a "panel disposed" exception here.
            try {

                this._webViewPanel.reveal();
                if (!!messageToWebView) {
                    // BUG: WebView might actually appear in 3 states: disposed, visible and inactive.
                    // Didn't find the way to distinguish the last two. 
                    // But when it is inactive, it will be activated with above reveal() method,
                    // and then miss this message we're sending here. No good solution for this problem so far...
                    this._webViewPanel.webview.postMessage(messageToWebView);
                }

                return;

            } catch (err) {

                this._webViewPanel = null;
            }
        }

        await this._backend.getBackend();

        this._webViewPanel = this.showWebView('', messageToWebView);

        this._webViewPanel.onDidDispose(() => {
            this._webViewPanel = null;
            this._onViewStatusChanged();
        });
    }

    // Permanently deletes all underlying Storage resources for this Task Hub
    async deleteTaskHub(): Promise<void> {

        if (!this._backend.backendUrl) {
            throw new Error('Backend is not started');
        }

        const headers: any = {};
        headers[SharedConstants.NonceHeaderName] = this._backend.backendCommunicationNonce;

        await axios.post(`${this._backend.backendUrl}/--${this._hubName}/delete-task-hub`, {}, { headers });

        this.cleanup();
    }

    // Handles 'Goto instanceId...' context menu item
    async gotoInstanceId(): Promise<void> {

        const instanceId = await this.askForInstanceId();

        if (!instanceId) {
            return;
        }

        // Opening another WebView
        this._childWebViewPanels.push(this.showWebView(instanceId));
    }

    // Converts script and CSS links
    static fixLinksToStatics(originalHtml: string, pathToBackend: string, webView: vscode.Webview): string {

        var resultHtml: string = originalHtml;

        const regex = / (href|src)="\/([0-9a-z.\/]+)"/ig;
        var match: RegExpExecArray | null;
        while (match = regex.exec(originalHtml)) {

            const relativePath = match[2];
            const localPath = path.join(pathToBackend, relativePath);
            const newPath = webView.asWebviewUri(vscode.Uri.file(localPath)).toString();

            resultHtml = resultHtml.replace(`/${relativePath}`, newPath);
        }

        return resultHtml;
    }

    // Validates incoming SVG, just to be extra sure...
    static looksLikeSvg(data: string): boolean {
        return data.startsWith('<svg') && data.endsWith('</svg>') && !data.toLowerCase().includes('<script');
    }

    // Reference to the already opened WebView with the main page
    private _webViewPanel: vscode.WebviewPanel | null = null;    

    // Reference to all child WebViews
    private _childWebViewPanels: vscode.WebviewPanel[] = [];

    // Functions and proxies currently shown
    private _functionsAndProxies: { [name: string]: { filePath?: string, pos?: number, bindings?: any[] } } = {};

    private _functionProjectPath: string = '';

    private static readonly ViewType = 'durableFunctionsMonitor';
    private static readonly GlobalStateName = MonitorView.ViewType + 'WebViewState';

    // Opens a WebView with main page or orchestration page in it
    private showWebView(orchestrationId: string = '', messageToWebView: any = undefined): vscode.WebviewPanel {

        const title = (!!orchestrationId) ?
            `Instance '${orchestrationId}'`
            :
            `Durable Functions Monitor (${this.taskHubFullTitle})`;

        const panel = vscode.window.createWebviewPanel(
            MonitorView.ViewType,
            title,
            vscode.ViewColumn.One,
            {
                retainContextWhenHidden: true,
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(this.staticsFolder)]
            }
        );

        var html = fs.readFileSync(path.join(this.staticsFolder, 'index.html'), 'utf8');
        html = MonitorView.fixLinksToStatics(html, this.staticsFolder, panel.webview);

        // Also passing persisted settings via HTML
        const webViewState = this._context.globalState.get(MonitorView.GlobalStateName, {});

        html = this.embedOrchestrationIdAndState(html, orchestrationId, webViewState);
        html = this.embedIsFunctionGraphAvailable(html, !!this._functionProjectPath);
        html = this.embedThemeAndSettings(html);

        panel.webview.html = html;

        // handle events from WebView
        panel.webview.onDidReceiveMessage(request => this.handleMessageFromWebView(panel.webview, request, messageToWebView), undefined, this._context.subscriptions);

        return panel;
    }

    // Does communication between code in WebView and this class
    private handleMessageFromWebView(webView: vscode.Webview, request: any, messageToWebView: any): void {

        switch (request.method) {
            case 'IAmReady':
                // Sending an initial message (if any), when the webView is ready
                if (!!messageToWebView) {
                    webView.postMessage(messageToWebView);
                    messageToWebView = undefined;
                }
                return;
            case 'PersistState':
                // Persisting state values
                const webViewState = this._context.globalState.get(MonitorView.GlobalStateName, {}) as any;
                webViewState[request.key] = request.data;
                this._context.globalState.update(MonitorView.GlobalStateName, webViewState);
                return;
            case 'OpenInNewWindow':
                // Opening another WebView
                this._childWebViewPanels.push(this.showWebView(request.url));
                return;
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
            case 'GotoFunctionCode': {

                const func = this._functionsAndProxies[request.url];
                if (!!func && !!func.filePath) {

                    vscode.window.showTextDocument(vscode.Uri.file(func.filePath)).then(ed => {

                        const pos = ed.document.positionAt(!!func.pos ? func.pos : 0);

                        ed.selection = new vscode.Selection(pos, pos);
                        ed.revealRange(new vscode.Range(pos, pos));
                    });
                }

                return;
            }
            case 'GotoBinding': {

                const func = this._functionsAndProxies[request.url];
                if (!!func && !!func.bindings) {

                    const binding = func.bindings[request.data];

                    this.navigateToBinding(binding)
                        .catch(err => this._log(`Failed to navigate to binding. ${err.message ?? err}\n`));
                }

                return;
            }
            case 'VisualizeFunctionsAsAGraph':

                const ws = vscode.workspace;
                if (!!ws.rootPath && fs.existsSync(path.join(ws.rootPath, 'host.json'))) {
                    this._functionGraphList.visualizeProjectPath(ws.rootPath);
                }

                return;
        }

        // Intercepting request for Function Map
        if (request.method === "GET" && request.url === '/function-map') {
            
            if (!this._functionProjectPath) {
                return;
            }

            const requestId = request.id;
            this._functionGraphList.traverseFunctions(this._functionProjectPath).then(result => {

                this._functionsAndProxies = {};
                for (const name in result.functions) {
                    this._functionsAndProxies[name] = result.functions[name];
                }
                for (const name in result.proxies) {
                    this._functionsAndProxies['proxy.' + name] = result.proxies[name];
                }

                webView.postMessage({
                    id: requestId,
                    data: { 
                        functions: result.functions,
                        proxies: result.proxies
                    }
                });

            }, err => {
                // err might fail to serialize here, so passing err.message only
                webView.postMessage({ id: requestId, err: { message: err.message } });
            });

            return;
        }

        // Then it's just a propagated HTTP request
        const requestId = request.id;

        const headers: any = {};
        headers[SharedConstants.NonceHeaderName] = this._backend.backendCommunicationNonce;

        // Workaround for https://github.com/Azure/azure-functions-durable-extension/issues/1926
        var hubName = this._hubName;
        if (hubName === 'TestHubName' && request.method === 'POST' && request.url.match(/\/(orchestrations|restart)$/i)) {
            // Turning task hub name into lower case, this allows to bypass function name validation
            hubName = 'testhubname';
        }

        axios.request({
            url: `${this._backend.backendUrl}/--${hubName}${request.url}`,
            method: request.method,
            data: request.data,
            headers
        }).then(response => {

            webView.postMessage({ id: requestId, data: response.data });
            
        }, err => {

            webView.postMessage({ id: requestId, err: { message: err.message, response: { data: !err.response ? undefined : err.response.data } } });
        });
    }

    // Embeds the current color theme
    private embedThemeAndSettings(html: string): string {

        const theme = [2, 3].includes((vscode.window as any).activeColorTheme.kind) ? 'dark' : 'light';

        return html.replace('<script>var DfmClientConfig={}</script>',
            `<script>var DfmClientConfig={'theme':'${theme}','showTimeAs':'${Settings().showTimeAs}'}</script>`);
    }

    // Embeds the orchestrationId in the HTML served
    private embedOrchestrationIdAndState(html: string, orchestrationId: string, state: any): string {
        return html.replace(
            `<script>var OrchestrationIdFromVsCode="",StateFromVsCode={}</script>`,
            `<script>var OrchestrationIdFromVsCode="${orchestrationId}",StateFromVsCode=${JSON.stringify(state)}</script>`
        );
    }

    // Embeds the isFunctionGraphAvailable flag in the HTML served
    private embedIsFunctionGraphAvailable(html: string, isFunctionGraphAvailable: boolean): string {

        if (!isFunctionGraphAvailable) {
            return html;
        }

        return html.replace(
            `<script>var IsFunctionGraphAvailable=0</script>`,
            `<script>var IsFunctionGraphAvailable=1</script>`
        );
    }

    private askForInstanceId(): Promise<string> {
        return new Promise<string>((resolve, reject) => {

            var instanceId = '';
            const instanceIdPick = vscode.window.createQuickPick();

            instanceIdPick.onDidHide(() => {

                instanceIdPick.dispose();
                resolve('');
            });

            instanceIdPick.onDidChangeSelection(items => {
                if (!!items && !!items.length) {
                    instanceId = items[0].label;
                }
            });

            // Still allowing to type free text
            instanceIdPick.onDidChangeValue(value => {
                instanceId = value;

                // Loading suggestions from backend
                if (instanceId.length > 1) {
                    this.getInstanceIdSuggestions(instanceId).then(suggestions => {

                        instanceIdPick.items = suggestions.map(id => {
                            return { label: id };
                        });
                    });
                } else {
                    instanceIdPick.items = [];
                }
            });

            instanceIdPick.onDidAccept(() => {

                instanceIdPick.hide();
                resolve(instanceId);
            });

            instanceIdPick.title = `(${this.taskHubFullTitle}) instanceId to go to:`;

            instanceIdPick.show();
        });
    }

    // Human-readable TaskHub title in form '[storage-account]/[task-hub]'
    private get taskHubFullTitle(): string {

        return `${ConnStringUtils.GetStorageName(this._backend.storageConnectionStrings)}/${this._hubName}`;
    }

    // Returns orchestration/entity instanceIds that start with prefix
    private getInstanceIdSuggestions(prefix: string): Promise<string[]> {

        const headers: any = {};
        headers[SharedConstants.NonceHeaderName] = this._backend.backendCommunicationNonce;

        return axios.get(`${this._backend.backendUrl}/--${this._hubName}/id-suggestions(prefix='${prefix}')`, { headers })
            .then(response => {
                return response.data as string[];
            });
    }

    private async navigateToBinding(binding: any): Promise<void> {

        const creds = this._getTokenCredentialsForGivenConnectionString(this._backend.storageConnectionStrings[0]);
        if (!creds) {
            return;
        }
        
        switch (binding.type) {

            case 'blob':
            case 'blobTrigger': {

                const storageAccountName = ConnStringUtils.GetAccountName(this._backend.storageConnectionStrings[0]);
                if (!storageAccountName) {
                    return;
                }
        
                const blobPath = binding.blobPath ?? (binding.path ?? '');

                await this.navigateToStorageBlob(creds, storageAccountName, blobPath);
            }
            break;
            case 'queue':
            case 'queueTrigger': {

                const storageAccountName = ConnStringUtils.GetAccountName(this._backend.storageConnectionStrings[0]);
                if (!storageAccountName) {
                    return;
                }

                await this.navigateToStorageQueue(creds, storageAccountName, binding.queueName);
            }
            break;
            case 'table': {

                const storageAccountName = ConnStringUtils.GetAccountName(this._backend.storageConnectionStrings[0]);
                if (!storageAccountName) {
                    return;
                }

                await this.navigateToStorageTable(creds, storageAccountName, binding.tableName);
            }
            break;
            case 'serviceBus':
            case 'serviceBusTrigger': {

                const queueOrTopicName =
                    binding.queueOrTopicName ?? (
                        binding.queueName ?? (
                            binding.topicName ?? ''));
                
                await this.navigateToServiceBusQueueOrTopic(creds, queueOrTopicName);
            }
            break;
            case 'eventHub':
            case 'eventHubTrigger': {

                await this.navigateToEventHub(creds, binding.eventHubName);
            }
            break;
        }
    }

    private async navigateToStorageBlob(creds: AzureConnectionInfo, storageAccountName: string, blobPath: string): Promise<void> {

        const storageAccounts = await this.getAzureResources(creds, 'microsoft.storage/storageaccounts', storageAccountName?.toLowerCase()) as { id: string }[];
        if (storageAccounts.length !== 1) {
            return;
        }

        const portalUrl = `https://ms.portal.azure.com/#view/Microsoft_Azure_Storage/ContainerMenuBlade/~/overview/storageAccountId/${encodeURIComponent(storageAccounts[0].id)}/path/${blobPath}`;

        await open(portalUrl);
    }

    private async navigateToStorageQueue(creds: AzureConnectionInfo, storageAccountName: string, queueName: string): Promise<void> {

        const storageAccounts = await this.getAzureResources(creds, 'microsoft.storage/storageaccounts', storageAccountName?.toLowerCase()) as { id: string }[];
        if (storageAccounts.length !== 1) {
            return;
        }

        const portalUrl = `https://ms.portal.azure.com/#view/Microsoft_Azure_Storage/QueueMenuBlade/~/overview/storageAccountId/${encodeURIComponent(storageAccounts[0].id)}/queueName/${queueName}`;

        await open(portalUrl);
    }

    private async navigateToStorageTable(creds: AzureConnectionInfo, storageAccountName: string, tableName: string): Promise<void> {

        const storageAccounts = await this.getAzureResources(creds, 'microsoft.storage/storageaccounts', storageAccountName?.toLowerCase()) as { id: string }[];
        if (storageAccounts.length !== 1) {
            return;
        }

        // Using Azure Storage extension for this, since it is not (yet) possible to navigate to a Storage Table in portal
        var storageExt = vscode.extensions.getExtension('ms-azuretools.vscode-azurestorage');
        if (!storageExt) {
            return;
        }

        if (!storageExt.isActive) {
            await storageExt.activate();
        }
        
        await vscode.commands.executeCommand('azureStorage.openTable', {

            root: {
                storageAccountId: storageAccounts[0].id,
                // This works with older versions of Azure Storage ext
                subscriptionId: creds.subscriptionId
            },

            subscription: {
                // This works with newer versions of Azure Storage ext
                subscriptionId: creds.subscriptionId
            },

            tableName
        });
    }


    private async navigateToServiceBusQueueOrTopic(creds: AzureConnectionInfo, queueOrTopicName: string): Promise<void> {

        const namespaces = await this.getAzureResources(creds, 'microsoft.servicebus/namespaces') as { id: string, name: string, sku: any, location: string }[];
        if (!namespaces.length) {
            return;
        }

        const accessToken = (await creds.credentials.getToken()).accessToken;

        const promises = namespaces.map(async ns => {

            const queuesUri = `https://management.azure.com${ns.id}/queues?api-version=2017-04-01`;
            const queuesPromise = axios.get(queuesUri, { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const topicsUri = `https://management.azure.com${ns.id}/topics?api-version=2017-04-01`;
            const topicsPromise = axios.get(topicsUri, { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const queues: { id: string, name: string }[] = ((await queuesPromise).data?.value) ?? [];
            const topics: { id: string, name: string }[] = ((await topicsPromise).data?.value) ?? [];

            const matchedQueue = queues.find(q => q.name.toLowerCase() === queueOrTopicName.toLowerCase());
            const matchedTopic = topics.find(t => t.name.toLowerCase() === queueOrTopicName.toLowerCase());

            return {
                name: ns.name,
                location: ns.location,
                sku: ns.sku,
                matchedQueueId: !!matchedQueue ? matchedQueue.id : '',
                matchedTopicId: !!matchedTopic ? matchedTopic.id : '',
            };
        });

        const namespacesContainingThisName = (await Promise.all(promises))
            .filter(i => !!i.matchedQueueId || !!i.matchedTopicId);
        
        let namespace: { matchedQueueId: string, matchedTopicId: string } | undefined;
        
        if (namespacesContainingThisName.length > 1) {
            
           // Asking user to resolve namespace ambiguity
           namespace = await vscode.window.showQuickPick(namespacesContainingThisName.map(ns => {
            
                return {
                    label: ns.name,
                    description: `location: ${ns.location}, SKU: ${ns.sku?.name}`,
                    matchedQueueId: ns.matchedQueueId,
                    matchedTopicId: ns.matchedTopicId,
                }
               
            }), { title: `"${queueOrTopicName}" is present in multiple Service Bus namespaces. Pick up the namespace to navigate to.`} );
            
            if (!namespace) {
                return;
            }

        } else if (namespacesContainingThisName.length === 1) {

            namespace = namespacesContainingThisName[0];
            
        } else {
            return;
        }

        const resourceId = namespace.matchedQueueId ?? namespace.matchedTopicId;
        const portalUrl = `https://ms.portal.azure.com/#@${creds.tenantId}/resource/${resourceId}`;

        await open(portalUrl);
    }

    private async navigateToEventHub(creds: AzureConnectionInfo, hubName: string): Promise<void> {

        const namespaces = await this.getAzureResources(creds, 'microsoft.eventhub/namespaces') as { id: string, name: string, sku: any, location: string }[];
        if (!namespaces.length) {
            return;
        }

        const accessToken = (await creds.credentials.getToken()).accessToken;

        const promises = namespaces.map(async ns => {

            const hubsUri = `https://management.azure.com${ns.id}/eventhubs?api-version=2017-04-01`;
            const hubsResponse = await axios.get(hubsUri, { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const hubs: { id: string, name: string }[] = (hubsResponse.data?.value) ?? [];

            const matchedHub = hubs.find(q => q.name.toLowerCase() === hubName.toLowerCase());

            return {
                name: ns.name,
                location: ns.location,
                sku: ns.sku,
                matchedHubId: !!matchedHub ? matchedHub.id : '',
            };
        });

        const namespacesContainingThisName = (await Promise.all(promises))
            .filter(i => !!i.matchedHubId);
        
        let namespace: { matchedHubId: string } | undefined;
        
        if (namespacesContainingThisName.length > 1) {
            
           // Asking user to resolve namespace ambiguity
           namespace = await vscode.window.showQuickPick(namespacesContainingThisName.map(ns => {
            
                return {
                    label: ns.name,
                    description: `location: ${ns.location}, SKU: ${ns.sku?.name}`,
                    matchedHubId: ns.matchedHubId,
                }
               
            }), { title: `"${hubName}" is present in multiple Event Hub namespaces. Pick up the namespace to navigate to.`} );
            
            if (!namespace) {
                return;
            }

        } else if (namespacesContainingThisName.length === 1) {

            namespace = namespacesContainingThisName[0];
            
        } else {
            return;
        }

        const portalUrl = `https://ms.portal.azure.com/#@${creds.tenantId}/resource/${namespace.matchedHubId}`;

        await open(portalUrl);
    }

    private async getAzureResources(creds: AzureConnectionInfo, resourceType: string, resourceName?: string): Promise<any[]>{

        const resourceGraphClient = new ResourceGraphClient(creds.credentials);
        const response = await resourceGraphClient.resources({
            subscriptions: [creds.subscriptionId],
            query: `resources | where type == "${resourceType}"${ !!resourceName ? ` and name == "${resourceName}"` : '' }`
        });

        return response.data ?? [];
    }
}