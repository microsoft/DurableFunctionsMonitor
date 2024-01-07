// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { Method } from 'axios';
import { IBackendClient } from './IBackendClient';
import { OrchestrationsPathPrefix } from '../states/LoginState';

// DFM-specific route prefix, that is passed to us from the backend via a global static variable
declare const DfmRoutePrefix: string;

// API route prefix
declare const DfmApiRoutePrefix: string;

const dfmRoutePrefixWithSlashes = !DfmRoutePrefix ? '/' : `/${DfmRoutePrefix}/`;
const RoutePrefix = !process.env.REACT_APP_BACKEND_BASE_URI ? dfmRoutePrefixWithSlashes : process.env.REACT_APP_BACKEND_BASE_URI + '/';
export const BackendUri = !DfmApiRoutePrefix ? RoutePrefix + 'a/p/i' : '/' + DfmApiRoutePrefix;

// Common IBackendClient implementation, sends HTTP requests directly
export class BackendClient implements IBackendClient {

    get isVsCode(): boolean { return false; }

    get routePrefixAndTaskHubName(): string { return RoutePrefix + this._getTaskHubName(); }

    constructor(private _getTaskHubName: () => string, private _getAuthorizationHeaderAsync: () => Promise<{}>) {

        // Turning redirects off, as we don't ever need them anyway
        axios.defaults.maxRedirects = 0;
    }

    call(method: Method, url: string, data?: any): Promise<any> {

        // Two-bugs away
        if (!this.isMethodSupported(method)) {
            return Promise.reject(new Error(`Method ${method} not supported`));
        }

        return new Promise<any>((resolve, reject) => {

            this._getAuthorizationHeaderAsync().then(headers => {

                axios.request({
                    url: BackendUri + '/' + this.getTaskHubName(method, url) + url,
                    method, data, headers
                }).then(r => { resolve(r.data); }, reject);
            });
        });
    }

    download(url: string, fileName: string): Promise<void> {

        return new Promise<void>((resolve, reject) => {

            this._getAuthorizationHeaderAsync().then(headers => {

                axios.request({
                    url: BackendUri + '/' + this.getTaskHubName('POST', url) + url,
                    responseType: 'arraybuffer',
                    method: 'POST', headers
                }).then(r => {

                    switch (r.headers['content-type']) {
                        case 'application/json':
                            fileName = `${fileName}.json`;
                            break;
                        case 'text/plain':
                            fileName = `${fileName}.txt`;
                            break;
                        default:
                            fileName = `${fileName}.dat`;
                            break;
                    }
        
                    const downloadLink = document.createElement('a');
                    downloadLink.href = window.URL.createObjectURL(new Blob([r.data]));
                    downloadLink.setAttribute('download', fileName);
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
       
                    resolve();

                }, reject);
            });
        });
    }

    showDetails(instanceId: string) {

        // Just to be extra sure
        instanceId = instanceId?.replace(/javascript:/gi, '');

        window.open(`${this.routePrefixAndTaskHubName}${OrchestrationsPathPrefix}${instanceId}`);
    }

    private getTaskHubName(method: Method, url: string): string {

        // Workaround for https://github.com/Azure/azure-functions-durable-extension/issues/1926
        let hubName = this._getTaskHubName();
        if (hubName.endsWith('TestHubName') && method === 'POST' && url.match(/\/(orchestrations|restart)$/i)) {
            // Turning task hub name into lower case, this allows to bypass function name validation
            hubName = hubName.replace('TestHubName', 'testhubname');
        }

        // Need to add preceding dash to a plain taskHubName, otherwise it won't route properly
        if (!hubName.includes('-')) {
            hubName = '--' + hubName;
        }

        return hubName;
    }

    private isMethodSupported(method: Method): boolean {

        return ['get', 'post', 'put'].includes(method.toLowerCase());
    }
}