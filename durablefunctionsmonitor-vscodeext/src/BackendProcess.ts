// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const portscanner = require('portscanner');

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as killProcessTree from 'tree-kill';
import axios from 'axios';
import { spawn, spawnSync, ChildProcess } from 'child_process';

import * as SharedConstants from './SharedConstants';
import { Settings } from './Settings';
import { StorageConnectionSettings } from "./StorageConnectionSettings";

// Responsible for running the backend process
export class BackendProcess {

    constructor(private _binariesFolder: string,
        private _storageConnectionSettings: StorageConnectionSettings,
        private _removeMyselfFromList: () => void,
        private _log: (l: string) => void)
    { }
    
    // Underlying Storage Connection Strings
    get storageConnectionStrings(): string[] {
        return this._storageConnectionSettings.storageConnStrings;
    }

    // Information about the started backend (if it was successfully started)
    get backendUrl(): string {
        return this._backendUrl;
    }

    // Folder where backend is run from (might be different, if the backend needs to be published first)
    get binariesFolder(): string {
        return this._eventualBinariesFolder;
    }

    // Kills the pending backend process
    cleanup(): Promise<any> {

        this._backendPromise = null;
        this._backendUrl = '';

        if (!this._funcProcess) {
            return Promise.resolve();
        }

        console.log('Killing func process...');

        return new Promise((resolve) => {

            // The process is a shell. So to stop func.exe, we need to kill the entire process tree.
            killProcessTree(this._funcProcess!.pid, resolve);
            this._funcProcess = null;
        });
    }

    get backendCommunicationNonce(): string { return this._backendCommunicationNonce; }

    // Ensures that the backend is running (starts it, if needed) and returns its properties
    getBackend(): Promise<void> {

        if (!!this._backendPromise) {
            return this._backendPromise;
        }

        this._backendPromise = new Promise<void>((resolve, reject) => {

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Starting the backend `,
                cancellable: true
            }, (progress, token) => new Promise(stopProgress => {

                // Starting the backend on a first available port
                portscanner.findAPortNotInUse(37072, 38000).then((portNr: number) => {

                    const backendUrl = Settings().backendBaseUrl.replace('{portNr}', portNr.toString());
                    progress.report({ message: backendUrl });

                    // Now running func.exe in backend folder
                    this.startBackendOnPort(portNr, backendUrl, token)
                        .then(resolve, reject)
                        .finally(() => stopProgress(undefined));

                }, (err: any) => { stopProgress(undefined); reject(`Failed to choose port for backend: ${err.message}`); });
            }));
        });

        // Allowing the user to try again
        this._backendPromise.catch(() => {

            // This call is important, without it a typo in connString would persist until vsCode restart
            this._removeMyselfFromList();
        });

        return this._backendPromise;
    }
    
    // Reference to the shell instance running func.exe
    private _funcProcess: ChildProcess | null = null;

    // Promise that resolves when the backend is started successfully
    private _backendPromise: Promise<void> | null = null;

    // Information about the started backend (if it was successfully started)
    private _backendUrl: string = '';

    // Folder where backend is run from (might be different, if the backend needs to be published first)
    private _eventualBinariesFolder: string = this._binariesFolder;

    // A nonce for communicating with the backend
    private _backendCommunicationNonce = crypto.randomBytes(64).toString('base64');

    // Runs the backend Function instance on some port
    private startBackendOnPort(portNr: number, backendUrl: string, cancelToken: vscode.CancellationToken): Promise<void> {

        return new Promise<void>((resolve, reject) => {

            this._log(`Attempting to start the backend from ${this._binariesFolder} on ${backendUrl}...`);

            if (!fs.existsSync(this._binariesFolder)) {
                reject(`Couldn't find backend binaries in ${this._binariesFolder}`);
                return;
            }
    
            // If this is a source code project
            if (fs.readdirSync(this._binariesFolder).some(fn => fn.toLowerCase().endsWith('.csproj'))) {
    
                const publishFolder = path.join(this._binariesFolder, 'publish');
                
                // if it wasn't published yet
                if (!fs.existsSync(publishFolder)) {
    
                    // publishing it
                    const publishProcess = spawnSync('dotnet', ['publish', '-o', publishFolder],
                        { cwd: this._binariesFolder, encoding: 'utf8' }
                    );
    
                    if (!!publishProcess.stdout) {
                        this._log(publishProcess.stdout.toString());
                    }
    
                    if (publishProcess.status !== 0) {
    
                        const err = 'dotnet publish failed. ' +
                            (!!publishProcess.stderr ? publishProcess.stderr.toString() : `status: ${publishProcess.status}`);
    
                        this._log(`ERROR: ${err}`);
                        reject(err);
                        return;
                    }
                }
    
                this._eventualBinariesFolder = publishFolder;
            }

            // Important to inherit the context from VsCode, so that globally installed tools can be found
            const env = process.env;
    
            env[SharedConstants.NonceEnvironmentVariableName] = this._backendCommunicationNonce;

            // Also setting AzureWebJobsSecretStorageType to 'files', so that the backend doesn't need Azure Storage
            env['AzureWebJobsSecretStorageType'] = 'files';

            if (this._storageConnectionSettings.isMsSql) {

                env[SharedConstants.MsSqlConnStringEnvironmentVariableName] = this._storageConnectionSettings.storageConnStrings[0];

                // For MSSQL just need to set DFM_HUB_NAME to something, doesn't matter what it is so far
                env[SharedConstants.HubNameEnvironmentVariableName] = this._storageConnectionSettings.hubName;

            } else {

                // Need to unset this, in case it was set previously
                delete env[SharedConstants.HubNameEnvironmentVariableName];
                
                env['AzureWebJobsStorage'] = this._storageConnectionSettings.storageConnStrings[0];
            }
            
            this._funcProcess = spawn('func', ['start', '--port', portNr.toString(), '--csharp'], {
                cwd: this._eventualBinariesFolder,
                shell: true,
                env
            });
    
            this._funcProcess.stdout?.on('data', (data) => {
                const msg = data.toString();
                this._log(msg);
    
                if (msg.toLowerCase().includes('no valid combination of account information found')) {
                    reject('The provided Storage Connection String and/or Hub Name seem to be invalid.');
                }
            });

            this._funcProcess!.stderr?.on('data', (data) => {
                const msg = data.toString();
                this._log(`ERROR: ${msg}`);
                reject(`Func: ${msg}`);
            });

            console.log(`Waiting for ${backendUrl} to respond...`);

            // Waiting for the backend to be ready
            const timeoutInSeconds = Settings().backendTimeoutInSeconds;
            const intervalInMs = 500, numOfTries = timeoutInSeconds * 1000 / intervalInMs;
            var i = numOfTries;
            const intervalToken = setInterval(() => {

                const headers: any = {};
                headers[SharedConstants.NonceHeaderName] = this._backendCommunicationNonce;

                // Pinging the backend and returning its URL when ready
                axios.get(`${backendUrl}/--${this._storageConnectionSettings.hubName}/about`, { headers }).then(response => {
                    console.log(`The backend is now running on ${backendUrl}`);
                    clearInterval(intervalToken);

                    this._backendUrl = backendUrl;

                    resolve();
                }, err => {
                        
                    if (!!err.response && err.response.status === 401) {
                        // This typically happens when mistyping Task Hub name

                        clearInterval(intervalToken);
                        reject(err.message);
                    }
                });

                if (cancelToken.isCancellationRequested) {

                    clearInterval(intervalToken);
                    reject(`Cancelled by the user`);

                } else if (--i <= 0) {
                    
                    console.log(`Timed out waiting for the backend!`);
                    clearInterval(intervalToken);
                    reject(`No response within ${timeoutInSeconds} seconds. Ensure you have the latest Azure Functions Core Tools installed globally.`);
                }

            }, intervalInMs);
        });
    }
}