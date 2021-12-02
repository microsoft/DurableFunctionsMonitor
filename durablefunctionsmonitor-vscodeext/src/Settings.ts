// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';

// Returns config values stored in VsCode's settings.json
export function Settings(): ISettings {

    const config = vscode.workspace.getConfiguration('durableFunctionsMonitor');

    // Better to have default values hardcoded here (not only in package.json) as well
    return {
        backendBaseUrl: config.get<string>('backendBaseUrl', 'http://localhost:{portNr}/a/p/i'),
        backendVersionToUse: config.get<'Default' | '.Net Core 3.1'>('backendVersionToUse', 'Default'),
        customPathToBackendBinaries: config.get<string>('customPathToBackendBinaries', ''),
        backendTimeoutInSeconds: config.get<number>('backendTimeoutInSeconds', 60),
        storageEmulatorConnectionString: config.get<string>('storageEmulatorConnectionString', 'AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;DefaultEndpointsProtocol=http;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;'),
        enableLogging: config.get<boolean>('enableLogging', false),
        showTimeAs: config.get<'UTC' | 'Local'>('showTimeAs', 'UTC'),
        showWhenDebugSessionStarts: config.get<boolean>('showWhenDebugSessionStarts', false),
    };
}

// Updates a config value stored in VsCode's settings.json
export function UpdateSetting(name: string, val: any) {

    const config = vscode.workspace.getConfiguration('durableFunctionsMonitor');
    config.update(name, val, true);
}

interface ISettings
{
    backendBaseUrl: string;
    backendVersionToUse: 'Default' | '.Net Core 3.1' | '.Net Core 2.1';
    customPathToBackendBinaries: string;
    backendTimeoutInSeconds: number;
    storageEmulatorConnectionString: string;
    enableLogging: boolean;
    showTimeAs: 'UTC' | 'Local';
    showWhenDebugSessionStarts: boolean;
}