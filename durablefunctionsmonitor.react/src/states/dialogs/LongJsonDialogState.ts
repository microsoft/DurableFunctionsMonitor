// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

// State of Long JSON Display Dialog
export class LongJsonDialogState extends ErrorMessageState {

    @computed
    get title(): string { return this._title; }

    @computed
    get value(): string { return this._value; }

    @computed
    get inProgress(): boolean { return this._inProgress; }

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    showDialog(title: string, jsonObject: any, instanceId?: string, fieldName?: 'input' | 'output' | 'custom-status') {

        // Converting from a string inside a string
        if (typeof jsonObject === 'string') {
            try {
                jsonObject = JSON.parse(jsonObject);
            } catch {}
        }

        this._instanceId = instanceId;
        this._fieldName = fieldName;

        this._title = title;
        this._value = (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject, null, 3));
        this._inProgress = false;
    }

    hideDialog() {

        if (!!this._inProgress) {
            return;
        }

        this._title = '';
        this._value = '';
        this._instanceId = undefined;
        this._fieldName = undefined;
    }

    downloadFieldValue() {

        if (!!this._inProgress) {
            return;
        }

        const uri = `/orchestrations('${this._instanceId}')/${this._fieldName}`;

        this._inProgress = true;
        this._backendClient.download(uri, this._fieldName).then(() => {

            this._inProgress = false;
            this.hideDialog();

        }, err => {

            this._inProgress = false;
            this.showError('Failed to download field value', err);
        });
    }

    @observable
    private _title: string;

    @observable
    private _value: string;

    @observable
    private _inProgress: boolean = false;

    private _instanceId: string | undefined;
    private _fieldName: 'input' | 'output' | 'custom-status' | undefined;
}