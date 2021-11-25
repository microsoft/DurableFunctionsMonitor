import { observable, computed } from 'mobx';

import { IBackendClient } from '../../services/IBackendClient';
import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { ICustomTabState, CustomTabTypeEnum } from './ICustomTabState';
import { CancelToken } from '../../CancelToken';

// State of a custom liquid markup tab on OrchestrationDetails view
export class LiquidMarkupTabState implements ICustomTabState {

    name: string = "";
    readonly description = "";
    readonly tabType = CustomTabTypeEnum.RawHtml;

    @computed
    get rawHtml(): string { return this._rawHtml; };

    constructor(private _orchestrationId: string, private _backendClient: IBackendClient) {
    }

    load(details: DurableOrchestrationStatus, cancelToken: CancelToken): Promise<void> {

        const uri = `/orchestrations('${this._orchestrationId}')/custom-tab-markup('${this.name}')`;
        return this._backendClient.call('POST', uri).then(response => {

            if (!cancelToken.isCancelled) {
               
                this._rawHtml = response;
            }
        });
    }

    @observable
    private _rawHtml: string;
}