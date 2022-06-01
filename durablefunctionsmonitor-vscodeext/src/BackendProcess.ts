// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

const portscanner = require('portscanner');

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import axios from 'axios';
import * as cp from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(cp.exec);

import * as SharedConstants from './SharedConstants';
import { Settings } from './Settings';
import { StorageConnectionSettings } from "./StorageConnectionSettings";
import { ConnStringUtils } from './ConnStringUtils';

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
    async cleanup(): Promise<any> {

        this._backendPromise = null;
        this._backendUrl = '';

        if (!this._funcProcess) {
            return;
        }

        console.log('Killing func process...');

        this._funcProcess.kill();
        this._funcProcess = null;
    }

    get backendCommunicationNonce(): string { return this._backendCommunicationNonce; }

    // Ensures that the backend is running (starts it, if needed) and returns its properties
    getBackend(): Promise<void> {

        if (!this._backendPromise) {

            this._backendPromise = this.getBackendAsync();
        }
        return this._backendPromise;
    }
    
    // Reference to the shell instance running func.exe
    private _funcProcess: cp.ChildProcess | null = null;

    // Promise that resolves when the backend is started successfully
    private _backendPromise: Promise<void> | null = null;

    // Information about the started backend (if it was successfully started)
    private _backendUrl: string = '';

    // Folder where backend is run from (might be different, if the backend needs to be published first)
    private _eventualBinariesFolder: string = this._binariesFolder;

    // A nonce for communicating with the backend
    private _backendCommunicationNonce = crypto.randomBytes(64).toString('base64');

    // Path to Functions host
    private static _funcExePath: string = '';

    // Prepares a set of environment variables for the backend process
    private getEnvVariables(): {} {

        // Important to inherit the context from VsCode, so that globally installed tools can be found
        const env = process.env;

        env[SharedConstants.NonceEnvironmentVariableName] = this._backendCommunicationNonce;

        // Also setting AzureWebJobsSecretStorageType to 'files', so that the backend doesn't need Azure Storage
        env['AzureWebJobsSecretStorageType'] = 'files';

        delete env['AzureWebJobsStorage'];
        delete env['AzureWebJobsStorage__accountName'];
        delete env[SharedConstants.MsSqlConnStringEnvironmentVariableName];

        if (this._storageConnectionSettings.isMsSql) {

            env[SharedConstants.MsSqlConnStringEnvironmentVariableName] = this._storageConnectionSettings.storageConnStrings[0];

            // For MSSQL just need to set DFM_HUB_NAME to something, doesn't matter what it is so far
            env[SharedConstants.HubNameEnvironmentVariableName] = this._storageConnectionSettings.hubName;

        } else {

            // Need to unset this, in case it was set previously
            delete env[SharedConstants.HubNameEnvironmentVariableName];
            
            if (!!this._storageConnectionSettings.isIdentityBasedConnection) {

                const storageAccountName = ConnStringUtils.GetAccountName(this._storageConnectionSettings.storageConnStrings[0]);
                env['AzureWebJobsStorage__accountName'] = storageAccountName;

            } else {

                env['AzureWebJobsStorage'] = this._storageConnectionSettings.storageConnStrings[0];
            }
        }

        return env;
    }

    // Runs the backend Function instance on some port
    private startBackendOnPort(funcExePath: string, portNr: number, backendUrl: string, cancelToken: vscode.CancellationToken): Promise<void> {

        return new Promise<void>((resolve, reject) => {

            this._log(`Using Functions host: ${funcExePath}\n`);
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
                    const publishProcess = cp.spawnSync('dotnet', ['publish', '-o', publishFolder],
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
            
            this._funcProcess = cp.spawn(funcExePath, ['start', '--port', portNr.toString(), '--csharp'], {
                cwd: this._eventualBinariesFolder,
                env: this.getEnvVariables()
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

    private async getBackendAsync(): Promise<void> {

        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: `Starting the backend `,
            cancellable: true
        };

        await vscode.window.withProgress(progressOptions, async (progress, token) => {

            try {

                const funcExePath = await this.getFuncExePath();

                // Starting the backend on a first available port
                const portNr = await portscanner.findAPortNotInUse(37072, 38000);

                const backendUrl = Settings().backendBaseUrl.replace('{portNr}', portNr.toString());
                progress.report({ message: backendUrl });

                // Now running func.exe in backend folder
                await this.startBackendOnPort(funcExePath, portNr, backendUrl, token)

            } catch (err) {
                
                // This call is important, without it a typo in connString would persist until vsCode restart
                this._removeMyselfFromList();

                throw err;
            }
        });
    }

    private async getFuncExePath(): Promise<string> {

        if (!!BackendProcess._funcExePath) {
            return BackendProcess._funcExePath;
        }

        if (!!Settings().customPathToAzureFunctionsHost) {
            
            BackendProcess._funcExePath = Settings().customPathToAzureFunctionsHost;
            return BackendProcess._funcExePath;
        }

        // trying to detect the npm global package folder
        var npmGlobalFolder = '';
        try {

            const npmListResult = await execAsync(`npm list -g --depth=0`);

            npmGlobalFolder = npmListResult
                .stdout
                .split('\n')[0];
            
        } catch (err) {
            this._log(`npm list -g failed. ${!(err as any).message ? err : (err as any).message}`)
        }

        if (!!npmGlobalFolder) {
            
            // Trying C:\Users\username\AppData\Roaming\npm\node_modules\azure-functions-core-tools\bin

            var globalFuncPath = path.join(npmGlobalFolder, `node_modules`, `azure-functions-core-tools`, `bin`, `func.exe`);

            if (!!fs.existsSync(globalFuncPath)) {

                BackendProcess._funcExePath = globalFuncPath;
                return BackendProcess._funcExePath;
            }

            globalFuncPath = path.join(npmGlobalFolder, `node_modules`, `azure-functions-core-tools`, `bin`, `func`);

            if (!!fs.existsSync(globalFuncPath)) {

                BackendProcess._funcExePath = globalFuncPath;
                return BackendProcess._funcExePath;
            }
        }

        // Trying C:\Program Files\Microsoft\Azure Functions Core Tools

        globalFuncPath = path.resolve(process.env.programfiles ?? '', 'Microsoft', 'Azure Functions Core Tools', 'func.exe');

        if (!!fs.existsSync(globalFuncPath)) {

            BackendProcess._funcExePath = globalFuncPath;
            return BackendProcess._funcExePath;
        }

        // Trying yarn global bin

        var yarnGlobalFolder = '';
        try {

            const yarnGlobalBinResult = await execAsync(`yarn global bin`);

            yarnGlobalFolder = yarnGlobalBinResult
                .stdout
                .split('\n')[0];
            
        } catch (err) {
            this._log(`yarn global bin failed. ${!(err as any).message ? err : (err as any).message}`)
        }

        if (!!yarnGlobalFolder) {

            var globalFuncPath = path.join(yarnGlobalFolder, `func.exe`);

            if (!!fs.existsSync(globalFuncPath)) {

                BackendProcess._funcExePath = globalFuncPath;
                return BackendProcess._funcExePath;
            }

            globalFuncPath = path.join(yarnGlobalFolder, process.platform === 'win32' ?  `func.cmd` : `func`);

            if (!!fs.existsSync(globalFuncPath)) {

                BackendProcess._funcExePath = globalFuncPath;
                return BackendProcess._funcExePath;
            }
        }

        // Defaulting to 'func' command, hopefully it will be properly resolved
        BackendProcess._funcExePath = 'func';
        return BackendProcess._funcExePath;
    }
}