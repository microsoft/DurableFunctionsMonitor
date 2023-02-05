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

const MinimumFuncVersion = { major: 4, minor: 0, patch: 4629 };

// Responsible for running the backend process
export class BackendProcess {

    constructor(private _extensionRootFolder: string,
        private _storageConnectionSettings: StorageConnectionSettings,
        private _removeMyselfFromList: () => void,
        private _saveTaskHubs: (storageConnString: string, schemaName: string | undefined, taskHubs: string[]) => Promise<void>,
        private _log: (l: string) => void)
    { }

    // Underlying Storage Connection Strings
    get storageConnectionString(): string {
        return this._storageConnectionSettings.storageConnString;
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
    private _eventualBinariesFolder: string = '';

    // A nonce for communicating with the backend
    private _backendCommunicationNonce = crypto.randomBytes(64).toString('base64');

    // Path to Functions host
    private static _funcExePath: string = '';

    // Version of Azure Functions Core Tools currently installed
    private static _funcVersion: string = '';

    // Prepares a set of environment variables for the backend process
    private getEnvVariables(): {} {

        // Important to inherit the context from VsCode, so that globally installed tools can be found
        const env = process.env;

        env[SharedConstants.NonceEnvironmentVariableName] = this._backendCommunicationNonce;

        // Also setting AzureWebJobsSecretStorageType to 'files', so that the backend doesn't need Azure Storage
        env['AzureWebJobsSecretStorageType'] = 'files';

        // Need to explicitly set this, to make sure it is not overshadowed by some global setting
        env['FUNCTIONS_WORKER_RUNTIME'] = 'dotnet';

        delete env['AzureWebJobsStorage'];
        delete env['AzureWebJobsStorage__accountName'];
        delete env[SharedConstants.MsSqlConnStringEnvironmentVariableName];
        delete env[SharedConstants.HubNameEnvironmentVariableName];
        delete env["AzureFunctionsJobHost__extensions__durableTask__storageProvider__schemaName"];

        if (this._storageConnectionSettings.isMsSql) {

            env[SharedConstants.MsSqlConnStringEnvironmentVariableName] = this._storageConnectionSettings.storageConnString;

            env[SharedConstants.HubNameEnvironmentVariableName] = this.hubName;

            // Also passing the custom DB schema name
            env["AzureFunctionsJobHost__extensions__durableTask__storageProvider__schemaName"] = this.schemaName;

        } else {

            if (!!this._storageConnectionSettings.isIdentityBasedConnection) {

                const storageAccountName = ConnStringUtils.GetAccountName(this._storageConnectionSettings.storageConnString);
                env['AzureWebJobsStorage__accountName'] = storageAccountName;

            } else {

                env['AzureWebJobsStorage'] = this._storageConnectionSettings.storageConnString;
            }
        }

        return env;
    }

    private get schemaName(): string {

        const hub = this._storageConnectionSettings.hubName;
        const slashPos = hub.lastIndexOf('/');
        return slashPos < 0 ? 'dt' : hub.substring(0, slashPos);
    }

    private get hubName(): string {

        const hub = this._storageConnectionSettings.hubName;
        const slashPos = hub.lastIndexOf('/');
        return slashPos < 0 ? hub : hub.substring(slashPos + 1);
    }

    // Runs the backend Function instance on some port
    private startBackendOnPort(funcExePath: string, portNr: number, backendUrl: string, cancelToken: vscode.CancellationToken): Promise<void> {

        return new Promise<void>((resolve, reject) => {

            this._funcProcess = cp.spawn(funcExePath, ['start', '--port', portNr.toString(), '--csharp'], {
                cwd: this._eventualBinariesFolder,
                env: this.getEnvVariables()
            });
    
            this._funcProcess.stdout?.on('data', (data) => {
                const msg = data.toString();
                this._log(msg);
    
                if (msg.toLowerCase().includes('no valid combination of account information found')) {
                    reject(new Error('The provided Storage Connection String and/or Hub Name seem to be invalid.'));
                }
            });

            this._funcProcess!.stderr?.on('data', (data) => {
                const msg = data.toString();
                this._log(`ERROR: ${msg}`);
                reject(new Error(`Func: ${msg}`));
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
                axios.get(`${backendUrl}/--${this.hubName}/about`, { headers }).then(response => {
                    console.log(`The backend is now running on ${backendUrl}`);
                    clearInterval(intervalToken);

                    this._backendUrl = backendUrl;

                    resolve();
                }, err => {
                        
                    if (!!err.response && err.response.status === 401) {
                        // This typically happens when mistyping Task Hub name

                        clearInterval(intervalToken);
                        reject(new Error(`Backend responded with 401 Unauthorized. This might happen when specifying a non-existent Task Hub name.`));
                    }
                });

                if (cancelToken.isCancellationRequested) {

                    clearInterval(intervalToken);
                    reject(new Error(`Cancelled by the user`));

                } else if (--i <= 0) {
                    
                    console.log(`Timed out waiting for the backend!`);
                    clearInterval(intervalToken);
                    reject(new Error(`No response within ${timeoutInSeconds} seconds. Ensure you have the latest Azure Functions Core Tools installed globally.`));
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
                this._log(`Using Functions host: ${funcExePath}\n`);

                // Starting the backend on a first available port
                const portNr = await portscanner.findAPortNotInUse(37072, 38000);

                const backendUrl = Settings().backendBaseUrl.replace('{portNr}', portNr.toString());
                progress.report({ message: backendUrl });

                const binariesFolder = await this.getAndCheckBinariesFolder(funcExePath);
                this._log(`Attempting to start the backend from ${binariesFolder} on ${backendUrl}...`);
    
                if (!fs.existsSync(binariesFolder)) {
                    throw new Error(`Couldn't find backend binaries in ${binariesFolder}`);
                }
        
                // If this is a source code project
                if (fs.readdirSync(binariesFolder).some(fn => fn.toLowerCase().endsWith('.csproj'))) {
        
                    const publishFolder = path.join(binariesFolder, 'publish');
                    
                    // if it wasn't published yet
                    if (!fs.existsSync(publishFolder)) {
        
                        // publishing it
                        const publishProcess = cp.spawnSync('dotnet', ['publish', '-o', publishFolder],
                            { cwd: binariesFolder, encoding: 'utf8' }
                        );
        
                        if (!!publishProcess.stdout) {
                            this._log(publishProcess.stdout.toString());
                        }
        
                        if (publishProcess.status !== 0) {
        
                            const err = 'dotnet publish failed. ' +
                                (!!publishProcess.stderr ? publishProcess.stderr.toString() : `status: ${publishProcess.status}`);
        
                            this._log(`ERROR: ${err}`);
                            throw new Error(err);
                        }
                    }
        
                    this._eventualBinariesFolder = publishFolder;
    
                } else {
    
                    this._eventualBinariesFolder = binariesFolder;
                }

                // Now running func.exe in backend folder
                await this.startBackendOnPort(funcExePath, portNr, backendUrl, token)

                // Also fetching Task Hub names from backend, but by now only for MSSQL
                if (this._storageConnectionSettings.isMsSql) {
                 
                    await this.loadTaskHubs();
                }

            } catch (err) {
                
                // This call is important, without it a typo in connString would persist until vsCode restart
                this._removeMyselfFromList();

                throw err;
            }
        });
    }

    private async loadTaskHubs(): Promise<void> {

        const headers: any = {};
        headers[SharedConstants.NonceHeaderName] = this.backendCommunicationNonce;

        try {

            const response = await axios.get(`${this.backendUrl}/task-hub-names`, { headers });

            await this._saveTaskHubs(this._storageConnectionSettings.storageConnString, this.schemaName, response.data);
            
        } catch (err: any) {

            this._log(`Failed to get Task Hub names from backend. ${err.message ?? err} \n`);
        }        
    }

    // Calculates the backend binaries folder to use, based on Settings
    private async getAndCheckBinariesFolder(funcExePath: string): Promise<string> {

        if (!BackendProcess._funcVersion) {

            try {

                BackendProcess._funcVersion = (await execAsync(`"${funcExePath}" --version`)).stdout;

            } catch(err: any) {

                throw new Error(`Azure Functions Core Tools not found. Ensure that you have the latest Azure Functions Core Tools installed globally.`);
            }
        }

        var customBinariesFolder = Settings().customPathToBackendBinaries;
        
        if (!!customBinariesFolder) {

            return customBinariesFolder;    

        } else if (!!this._storageConnectionSettings.isMsSql) {
            
            return path.join(this._extensionRootFolder, 'custom-backends', 'mssql');

        } else if (Settings().backendVersionToUse === '.Net Core 2.1') {

            return path.join(this._extensionRootFolder, 'custom-backends', 'netcore21');

        } else if (Settings().backendVersionToUse === '.Net Core 3.1') {

            return path.join(this._extensionRootFolder, 'custom-backends', 'netcore31');
        }

        // Default backend now expects at least Functions V4. Checking that it is installed
        if (!this.isFuncVersionUpToDate()) {
            
            // Making sure the version is re-validated next time
            BackendProcess._funcVersion = '';

            throw new Error(`Default backend now requires at least Azure Functions Core Tools v${MinimumFuncVersion.major}.${MinimumFuncVersion.minor}.${MinimumFuncVersion.patch}. Install latest Azure Functions Core Tools or, alternatively, select a custom backend in extension's settings.`);
        }

        return path.join(this._extensionRootFolder, 'backend');
    }

    private isFuncVersionUpToDate(): boolean {

        if (!BackendProcess._funcVersion) {
            // let's be permissive in this case
            return true;
        }

        const versionParts = BackendProcess._funcVersion.split('.');

        const version = {
            major: versionParts[0] || 0,
            minor: versionParts[1] || 0,
            patch: versionParts[2] || 0,
        }

        if (version.major !== MinimumFuncVersion.major) {
            return version.major > MinimumFuncVersion.major;
        }

        if (version.minor !== MinimumFuncVersion.minor) {
            return version.minor > MinimumFuncVersion.minor;
        }

        return version.patch >= MinimumFuncVersion.patch;
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