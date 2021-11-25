import { observable, computed } from 'mobx'

import { IBackendClient } from '../../services/IBackendClient';
import { ErrorMessageState } from '../ErrorMessageState';

// State of New Orchestration Instance Dialog
export class StartNewInstanceDialogState extends ErrorMessageState {

    @observable
    instanceId: string;
    @observable
    orchestratorFunctionName: string;
    @observable
    input: string;

    @computed
    get inProgress(): boolean { return this._inProgress; }

    @computed
    get dialogOpen(): boolean { return this._dialogOpen; };
    set dialogOpen(value: boolean) {
        this._dialogOpen = value;

        this.instanceId = '';
        this.orchestratorFunctionName = '';
        this.input = '';
    }

    get backendClient(): IBackendClient { return this._backendClient; }

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    showWithFunctionName(funcName: string) {
        this.dialogOpen = true;
        this.orchestratorFunctionName = funcName;
    }
    
    startNewInstance() {

        var inputObject = null;
        if (!!this.input) {
            try {

                inputObject = JSON.parse(this.input);
            
            } catch (err) {
    
                this.showError('Failed to parse input', err);
                return;
            }
        }

        this._inProgress = true;

        this._backendClient.call('POST', '/orchestrations', { id: this.instanceId, name: this.orchestratorFunctionName, data: inputObject })
        .then(response => {

            this._dialogOpen = false;
            this._backendClient.showDetails(response.instanceId);

        }, err => this.showError('Failed to start new instance', err))
        .finally(() => {
            this._inProgress = false;
        });
    }

    @observable
    private _dialogOpen: boolean = false;

    @observable
    private _inProgress: boolean = false;
}