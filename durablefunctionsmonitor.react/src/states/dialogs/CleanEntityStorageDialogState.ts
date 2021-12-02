// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

// State of Clean Entity Storage Dialog
export class CleanEntityStorageDialogState extends ErrorMessageState {

    @computed
    get dialogOpen(): boolean { return this._dialogOpen; };
    set dialogOpen(isOpen: boolean) {
        this._dialogOpen = isOpen;

        if (isOpen) {
            this._response = null;
            this.removeEmptyEntities = true;
            this.releaseOrphanedLocks = true;
        }
    }

    @computed
    get response(): CleanEntityStorageResponse | null { return this._response; };

    @computed
    get inProgress(): boolean { return this._inProgress; };

    @computed
    get isValid(): boolean {
        return true;
    };

    @observable
    removeEmptyEntities: boolean;
    @observable
    releaseOrphanedLocks: boolean;
    
    constructor(private _backendClient: IBackendClient) {
        super();
    }

    clean() {

        this._inProgress = true;

        this._backendClient.call('POST', '/clean-entity-storage', {
            removeEmptyEntities: this.removeEmptyEntities,
            releaseOrphanedLocks: this.releaseOrphanedLocks
        }).then(response => {
            this._response = response;
        }, err => this.showError('Clean Entity Storage failed', err))
        .finally(() => {
            this._inProgress = false;
        });
    }

    @observable
    private _dialogOpen: boolean = false;
    
    @observable
    private _inProgress: boolean = false;

    @observable
    private _response: CleanEntityStorageResponse | null = null;
}

export class CleanEntityStorageResponse
{
    numberOfEmptyEntitiesRemoved: number;
    numberOfOrphanedLocksRemoved: number;
}