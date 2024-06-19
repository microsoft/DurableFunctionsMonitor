// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

export const BatchOperations = ['[Select]', 'SUSPEND', 'RESUME', 'RESTART', 'REWIND', 'TERMINATE', 'RAISE EVENT', 'SET CUSTOM STATUS', 'PURGE', 'SEND SIGNAL'] as const;
export type BatchOperation = typeof BatchOperations[number];

class BatchOpInstance {

    @observable
    id: string;
    
    @observable
    name: string;

    @observable
    status: 'Pending' | 'Completed' | 'Failed';

    @observable
    statusText: string;

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.status = 'Pending'
        this.statusText = 'Not Started';
    }
}

// Batch operations execution dialog
export class BatchOpsDialogState extends ErrorMessageState {

    @observable
    instances: BatchOpInstance[] = [];

    @computed
    get operation(): BatchOperation { return this._operation; };
    set operation(value: BatchOperation) {

        this._operation = value;

        this.resetStatuses();

        this.stringInput = '';
        this.jsonInput = '';
        this.boolInput = true;
    }

    @observable
    stringInput: string;

    @observable
    jsonInput: string;

    @observable
    boolInput: boolean;

    @computed
    get stringInputTitle(): string {

        switch (this.operation) {
            case 'SUSPEND': return 'Reason (optional)';
            case 'RESUME': return 'Reason (optional)';
            case 'RAISE EVENT': return 'Event Name';
            case 'SEND SIGNAL': return 'Signal Name';
            default: return '';
        }
    }

    @computed
    get boolInputTitle(): string {

        switch (this.operation) {
            case 'RESTART': return 'Restart with new instanceId';
            default: return '';
        }
    }

    @computed
    get jsonInputTitle(): string {

        switch (this.operation) {
            case 'RAISE EVENT': return 'Event Data (JSON)';
            case 'SET CUSTOM STATUS': return 'New Custom Status (JSON)';
            case 'SEND SIGNAL': return 'Signal Data (JSON)';
            default: return '';
        }
    }

    @computed
    get inProgress(): boolean { return this._inProgress; }

    @computed
    get dialogOpen(): boolean { return this._dialogOpen; };
    set dialogOpen(value: boolean) {
        this._dialogOpen = value;

        this.instances = [];
        this._operation = '[Select]';
        this.stringInput = '';
        this.boolInput = true;
        this.jsonInput = '';

        if (!!this._dialogOpen) {
            
            this._inProgress = true;

            this._getShownInstances().then(result => { 

                this.instances = result.map(i => new BatchOpInstance(i.id, i.name) );

            }, err => { 

                // The main screen should show the error
                this._dialogOpen = false;

            }).finally(() => { 

                this._inProgress = false;
            });
        }
    }

    get backendClient(): IBackendClient { return this._backendClient; }

    constructor(private _backendClient: IBackendClient, private _getShownInstances: () => Promise<{ id: string, name: string }[]>) {
        super();
    }

    execute() {

        if (this.operation === '[Select]') {
            return;
        }

        this.resetStatuses();

        let inputObject = null;
        if (!!this.jsonInput) {
            try {

                inputObject = JSON.parse(this.jsonInput);
            
            } catch (err) {
    
                this.showError('Failed to parse JSON', err);
                return;
            }
        }

        this._inProgress = true;

        const promises: Promise<void>[] = [];

        for (const i of this.instances) {

            let url = `/orchestrations('${i.id}')/`;
            let requestBody = undefined;

            switch (this._operation) {
                case 'SUSPEND':
                    url += 'suspend';
                    requestBody = this.stringInput;
                    break;
                case 'RESUME':
                    url += 'resume';
                    requestBody = this.stringInput;
                    break;
                case 'RESTART':
                    url += 'restart';
                    requestBody = { restartWithNewInstanceId: this.boolInput };
                    break;
                case 'REWIND':
                    url += 'rewind';
                    break;
                case 'TERMINATE':
                    url += 'terminate';
                    break;
                case 'RAISE EVENT':
                    url += 'raise-event';
                    requestBody = { name: this.stringInput, data: inputObject };
                    break;
                case 'SET CUSTOM STATUS':
                    url += 'set-custom-status';
                    requestBody = inputObject;
                    break;
                case 'PURGE':
                    url += 'purge';
                    break;
                case 'SEND SIGNAL':
                    url += 'raise-event';
                    requestBody = { name: this.stringInput, data: inputObject };
                    break;
            }

            const promise = this._backendClient.call('POST', url, requestBody).then(response => {

                i.status = 'Completed';
                i.statusText = 'Succeeded';

            }, err => {

                i.status = 'Failed';
                i.statusText = ErrorMessageState.formatErrorMessage('Failed', err);
            });

            promises.push(promise);
        }

        Promise.all(promises).finally(() => {

            this._inProgress = false;
        });
    }

    @observable
    private _operation: BatchOperation;

    @observable
    private _dialogOpen: boolean = false;

    @observable
    private _inProgress: boolean = false;

    private resetStatuses() {

        for (const i of this.instances) {
            i.status = 'Pending';
            i.statusText = 'Not Started';
        }
    }
}