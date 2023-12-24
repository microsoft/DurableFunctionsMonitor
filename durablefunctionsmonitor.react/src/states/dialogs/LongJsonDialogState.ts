// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

// State of Long JSON Display Dialog
export class LongJsonDialogState extends ErrorMessageState {

    @observable
    title: string;

    @observable
    value: string;

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    showDialog(title: string, jsonObject: any, instanceId?: string, fieldName?: 'input' | 'output' | 'custom-status') {

        this._instanceId = instanceId;
        this._fieldName = fieldName;

        this.title = title;
        this.value = (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject, null, 3));
    }

    hideDialog() {
        this.title = '';
        this.value = '';
        this._instanceId = undefined;
        this._fieldName = undefined;
    }

    downloadFieldValue() {

        const uri = `/orchestrations('${this._instanceId}')/${this._fieldName}`;

        this._backendClient.download(uri, this._fieldName).then(() => {

            this.hideDialog();

        }, err => {
            this.showError('Failed to download field value', err);
        });
    }

    private _instanceId: string | undefined;
    private _fieldName: 'input' | 'output' | 'custom-status' | undefined;
}