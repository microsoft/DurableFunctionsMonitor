// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios, { Method } from 'axios';
import { IBackendClient } from './IBackendClient';
import { OrchestrationsPathPrefix } from '../states/LoginState';

// DFM-specific route prefix, that is passed to us from the backend via a global static variable
declare const DfmRoutePrefix: string;

const RoutePrefix = !process.env.REACT_APP_BACKEND_BASE_URI ? (!DfmRoutePrefix ? '/' : `/${DfmRoutePrefix}/`) : process.env.REACT_APP_BACKEND_BASE_URI + '/';
export const BackendUri = RoutePrefix + process.env.REACT_APP_BACKEND_PATH;

// Common IBackendClient implementation, sends HTTP requests directly
export class BackendClient implements IBackendClient {

    get isVsCode(): boolean { return false; }

    get routePrefixAndTaskHubName(): string { return RoutePrefix + this._getTaskHubName(); }

    constructor(private _getTaskHubName: () => string, private _getAuthorizationHeaderAsync: () => Promise<{}>) {
    }

    call(method: Method, url: string, data?: any): Promise<any> {

        // Two-bugs away
        if (!['get', 'post', 'put'].includes(method.toLowerCase())) {
            return Promise.reject(new Error(`Method ${method} not supported`));
        }

        return new Promise<any>((resolve, reject) => {

            this._getAuthorizationHeaderAsync().then(headers => {

                // Workaround for https://github.com/Azure/azure-functions-durable-extension/issues/1926
                var hubName = this._getTaskHubName();
                if (hubName.endsWith('TestHubName') && method === 'POST' && url.match(/\/(orchestrations|restart)$/i)) {
                    // Turning task hub name into lower case, this allows to bypass function name validation
                    hubName = hubName.replace('TestHubName', 'testhubname');
                }

                // Need to add preceding dash to a plain taskHubName, otherwise it won't route properly
                if (!hubName.includes('-')) {
                    hubName = '--' + hubName;
                }

                axios.request({
                    url: BackendUri + '/' + hubName + url,
                    method, data, headers
                }).then(r => { resolve(r.data); }, reject);
            });
        });
    }

    showDetails(instanceId: string) {
        window.open(`${this.routePrefixAndTaskHubName}${OrchestrationsPathPrefix}${instanceId}`);
    }
}