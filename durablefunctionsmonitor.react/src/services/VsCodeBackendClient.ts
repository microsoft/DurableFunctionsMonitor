// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Method } from 'axios';
import { IBackendClient } from './IBackendClient';

// Defines handlers for messages being sent by VsCode extension
export type VsCodeCustomMessageHandlers = {
    purgeHistory: (data: any) => void;
    cleanEntityStorage: (data: any) => void;
    startNewInstance: (data: any) => void;
};

// IBackendClient implementation for VsCode extension, forwards HTTP requests to VsCode
export class VsCodeBackendClient implements IBackendClient {

    get isVsCode(): boolean { return true; }

    get routePrefixAndTaskHubName(): string { return null; }

    constructor(private _vsCodeApi: any) {

        // Handling responses from VsCode
        window.addEventListener('message', event => {

            const message = event.data;

            // handling menu commands
            if (!!this._handlers && (!!this._handlers[message.id])) {

                try {
                    this._handlers[message.id](message.data);
                } catch(err) {
                    console.log('Failed to handle response from VsCode: ' + err);
                }

                return;
            }

            // handling HTTP responses
            const requestPromise = this._requests[message.id];
            if (!requestPromise) {
                return;
            }

            if (!!message.err) {
                requestPromise.reject(message.err);
            } else {
                requestPromise.resolve(message.data);
            }

            delete this._requests[message.id];
        });
    }

    call(method: Method | 'OpenInNewWindow', url: string, data?: any): Promise<any> {

        const requestId = Math.random().toString();

        // Sending request to VsCode
        this._vsCodeApi.postMessage({ id: requestId, method, url, data });

        return new Promise<any>((resolve, reject) => {
            this._requests[requestId] = { resolve, reject };
        });
    }

    download(url: string, fileName: string): Promise<void> {

        const requestId = Math.random().toString();

        // Sending request to VsCode
        this._vsCodeApi.postMessage({ id: requestId, method: 'Download', url, data: fileName });

        return new Promise<any>((resolve, reject) => {
            this._requests[requestId] = { resolve, reject };
        });
    }

    showDetails(instanceId: string) {
        this.call('OpenInNewWindow', instanceId);
    }

    setCustomHandlers(handlers: VsCodeCustomMessageHandlers) {

        this._handlers = handlers;

        // Notifying VsCode that we're ready to process messages
        // Cannot do this in ctor, because VsCodeBackendClient and PurgeHistoryDialogState depend on each other
        this._vsCodeApi.postMessage({ method: 'IAmReady' });
    }

    private _handlers: VsCodeCustomMessageHandlers;

    private _requests: {
        [id: string]: {
            resolve: (value?: any) => void,
            reject: (reason?: any) => void
        }
    } = {};
}