// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

// State of Connection Params Dialog
export class ConnectionParamsDialogState extends ErrorMessageState {

    @observable
    hubName: string;
    @observable
    connectionString: string;

    @computed
    get inProgress(): boolean { return this._inProgress; }

    @computed
    get isDirty(): boolean {
        return (this.connectionString !== this._oldConnectionString) || (this.hubName !== this._oldHubName);
    }

    @computed
    get dialogOpen(): boolean { return this._dialogOpen; };
    set dialogOpen(value: boolean) {
        this._dialogOpen = value;

        if (!!value) {

            this._inProgress = true;

            this._backendClient.call('GET', '/manage-connection').then(response => {
    
                this.connectionString = this._oldConnectionString = response.connectionString;
                this.hubName = this._oldHubName = response.hubName;
    
            }, err => this.showError('Load failed', err))
            .finally(() => {
                this._inProgress = false;
            });
        }
    }

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    @observable
    private _dialogOpen: boolean = false;

    @observable
    private _inProgress: boolean = false;

    private _oldConnectionString: string;
    private _oldHubName: string;
}