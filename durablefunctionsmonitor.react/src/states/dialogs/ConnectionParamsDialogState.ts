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
    get isReadonly(): boolean { return this._isReadOnly; }

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
                this._isReadOnly = response.isReadOnly;
    
            }, err => this.showError('Load failed', err))
            .finally(() => {
                this._inProgress = false;
            });
        }
    }

    constructor(private _backendClient: IBackendClient) {
        super();
    }
    
    saveConnectionParams() {

        this._inProgress = true;

        this._backendClient.call('PUT', '/manage-connection', {
            connectionString: this.connectionString !== this._oldConnectionString ? this.connectionString : '',
            hubName: this.hubName
        }).then(() => {
        
            this._dialogOpen = false;

            alert(`Your changes were saved to local.settings.json file, but they cannot be picked up automatically. Please, restart the Function Host for them to take effect.`);

        }, err => this.showError('Save failed', err))
        .finally(() => {
            this._inProgress = false;
        });
    }

    @observable
    private _dialogOpen: boolean = false;

    @observable
    private _inProgress: boolean = false;

    @observable
    private _isReadOnly: boolean = false;

    private _oldConnectionString: string;
    private _oldHubName: string;
}