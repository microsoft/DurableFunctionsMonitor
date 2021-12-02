// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'
import axios from 'axios';
import * as Msal from 'msal';

import { ErrorMessageState } from './ErrorMessageState';
import { BackendUri } from '../services/BackendClient';

// DFM-specific route prefix, that is passed to us from the backend via a global static variable
declare const DfmRoutePrefix: string;

export const OrchestrationsPathPrefix = `/orchestrations/`;

// Login State
export class LoginState extends ErrorMessageState {

    @computed
    get isLoggedIn(): boolean { return this._isLoggedIn; };

    @computed
    get isLoggedInAnonymously(): boolean { return !this._userName; };

    @computed
    get userName(): string { return this._userName; };

    @computed
    get taskHubName(): string { return this._taskHubName;  }

    @computed
    get allowedTaskHubNames(): string[] { return this._allowedTaskHubNames; }

    @observable
    menuAnchorElement?: Element;

    // Returns window.location.pathname minus DFM's client-side routing
    get locationPathName(): string {

        var result = window.location.pathname;

        const pos = result.lastIndexOf(OrchestrationsPathPrefix);
        if (pos >= 0) {
            result = result.substring(0, pos);
        }

        if (!result.endsWith('/')) {
            result += '/';
        }

        return result;
    }

    // Returns the site's root URI (everything _before_ Task Hub name)
    get rootUri(): string {

        const hubName = this.tryGetTaskHubName();
        if (!!hubName) {

            const pos = window.location.href.toLowerCase().lastIndexOf('/' + hubName.toLowerCase());
            if (pos >= 0) {
                return window.location.href.substring(0, pos);
            }
        }

        return window.location.origin +
            (
                window.location.pathname.endsWith('/') ?
                    window.location.pathname.substr(0, window.location.pathname.length - 1) :
                    window.location.pathname
            );
    }

    constructor() {
        super();

        // Turning redirects off, as we don't ever need them anyway
        axios.defaults.maxRedirects = 0;

        this.login();
    }

    login() {
        const uri = `${BackendUri}/easyauth-config`;
        axios.get(uri).then(response => this.loginWithEasyAuthConfig(response.data), err => this.showError('Failed to load auth config', err));
    }

    logout() {
        this.menuAnchorElement = undefined;

        if (!this._aadApp) {

            window.location.replace('/.auth/logout');

        } else {
            
            this._aadApp.logout();
        }
    }

    getAuthorizationHeaderAsync() {

        const headers = {};

        // Adding our custom anti-forgery token.
        // EasyAuth has its own built-in protection against XSRF, so we're doing this only 
        // to cover potential cases of hosting DfMon as part of some custom solution _outside_ Azure.
        const xsrfTokenCookieAndHeaderName = 'x-dfm-xsrf-token';
        const match = new RegExp(`${xsrfTokenCookieAndHeaderName}=([^;]+)`)
            .exec(decodeURIComponent(document.cookie));
        
        if (!!match) {
            headers[xsrfTokenCookieAndHeaderName] = match[1];
        }

        // Let's think we're on localhost and proceed with no auth
        if (!this._aadApp) {
            return new Promise<{}>((resolve, reject) => resolve(headers));
        }

        return new Promise<{}>((resolve, reject) => {
            // Obtaining a token to access our own AAD app
            const authParams: Msal.AuthenticationParameters = {
                scopes: [this._aadApp.getCurrentConfiguration().auth.clientId]
            };

            this._aadApp.acquireTokenSilent(authParams)
                .then((authResponse) => {

                    var accessToken = authResponse.accessToken;
                    if (!accessToken) {
                        // https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/736
                        // accessToken might randomly be returned as null, in which case we can probably use id_token
                        // (which is supposed to be the same)
                        console.log('DFM: accessToken is null, so using idToken.rawIdToken instead');
                        accessToken = authResponse.idToken.rawIdToken;
                    }

                    headers['Authorization'] = `Bearer ${accessToken}`;

                    resolve(headers);

                }, err => {
                    // If silent token aquiring failed, then just redirecting the user back to AAD, 
                    // so that the page is reloaded anyway.
                    // This is supposed to happen very rarely, as default refresh token lifetime is quite long.  
                    console.log(`DFM: acquireTokenSilent() failed (${err}), so calling acquireTokenRedirect()...`);
                    this._aadApp.acquireTokenRedirect(authParams);
                });
        });
    }

    @observable
    private _isLoggedIn: boolean = false;

    @observable
    private _userName: string;

    @observable
    private _taskHubName: string;

    @observable
    private _allowedTaskHubNames: string[];

    private _aadApp: Msal.UserAgentApplication;

    private loginWithEasyAuthConfig(config: {userName: string, clientId: string, authority: string}) {

        if (!config.clientId) {
            // Let's think we're on localhost or using server-directed login flow
            // and proceed with no client-side auth
            
            this._userName = config.userName;

            // Reloading the page upon cookie expiration
            axios.interceptors.response.use(response => response, err => {

                // Couldn't find a better way to detect this
                if (err.message === 'Network Error') {
                    window.location.reload();
                }

                return Promise.reject(err);
            });

            this.initializeTaskHubNameAndConfirmLogin();
            return;
        }

        // Configuring MSAL with values received from backend
        this._aadApp = new Msal.UserAgentApplication({
            auth: {
                clientId: config.clientId,
                authority: config.authority,
                redirectUri: this.rootUri
            }
        })

        // Checking if it was a redirect from AAD
        this._aadApp.handleRedirectCallback(() => { }, (authErr: Msal.AuthError, accountState: string) => {

            console.log(`Failed to handle login redirect. name: ${authErr.name}, message: ${authErr.message}, errorCode: ${authErr.errorCode}, errorMessage: ${authErr.errorMessage}, accountState: ${accountState}`);
        });

        const account = this._aadApp.getAccount();

        if (!account) {
            // Redirecting user to AAD. Redirect flow is more reliable (doesn't need popups enabled)
            this._aadApp.loginRedirect();

        } else {
            // We've logged in successfully. Setting user name.
            this._userName = account.userName;
            this.initializeTaskHubNameAndConfirmLogin();
        }
    }

    private initializeTaskHubNameAndConfirmLogin(): void {

        const hubName = this.tryGetTaskHubName();
        if (!!hubName) {

            this._taskHubName = hubName;
            this._isLoggedIn = true;
            return;
        }

        // Trying to load the list of allowed Task Hubs from the backend
        this.getAuthorizationHeaderAsync().then(headers => {

            const uri = `${BackendUri}/task-hub-names`;
            axios.get(uri, { headers }).then(response => {
                
                const hubNames: string[] = response.data;

                if (hubNames.length === 1) {
                    
                    // Redirecting to that Task Hub
                    window.location.pathname = this.locationPathName + hubNames[0];
                } else {

                    // Asking the user to choose from
                    this._allowedTaskHubNames = hubNames;
                }

            }, err => this.showError('Failed to load the list of Task Hubs', err));
        });
    }

    // Extracts Task Hub name from window.location.href, still honoring client-side routing and subpaths
    private tryGetTaskHubName(): string {

        const locationPathName = this.locationPathName;

        // If current path ends with DfmRoutePrefix, then it doesn't actually contain Task Hub name
        if (locationPathName.toLowerCase().endsWith(`/${DfmRoutePrefix.toLowerCase()}/`)) {
            return null;
        }

        const pathParts = locationPathName.split('/').filter(p => !!p);
        if (pathParts.length < 1) {
            return null;
        }

        // Consider the last path part to be the Task Hub name.
        // This should work even if we're hosted under some subpath
        return pathParts[pathParts.length - 1];
    }
}