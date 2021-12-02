// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { IBackendClient } from '../../services/IBackendClient';
import { ITypedLocalStorage } from '../ITypedLocalStorage';
import { CancelToken } from '../../CancelToken';

// Represents the state of a tab in the results pane
export interface IResultsTabState {

    reset(): void;

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean): Promise<void>;
}

// Resulting list of orchestrations represented as a plain table
export class ResultsListTabState implements IResultsTabState {

    @observable
    longJsonDialogState = {};
    
    @observable
    columnUnderMouse: string;

    @computed
    get hiddenColumns(): string[] { return this._hiddenColumns; }

    @computed
    get orchestrations(): DurableOrchestrationStatus[] { return this._orchestrations; }

    @computed
    get orderByDirection(): ('asc' | 'desc') { return this._orderByDirection; }

    @computed
    get orderBy(): string { return this._orderBy; }
    set orderBy(val: string) {

        if (this._orderBy !== val) {

            this._orderBy = val;
            this._orderByDirection = 'asc';

        } else if (this._orderByDirection === 'desc') {

            this._orderBy = '';
            this._orderByDirection = 'asc';
            }
        else {
            this._orderByDirection = 'desc';
        }

        this._refresh();
    }

    get backendClient(): IBackendClient { return this._backendClient; }

    constructor(private _backendClient: IBackendClient,
        private _localStorage: ITypedLocalStorage<ResultsListTabState>, private _refresh: () => void) {

        const orderByString = this._localStorage.getItem('orderBy');
        if (!!orderByString) {
            this._orderBy = orderByString;
        }

        const orderByDirectionString = this._localStorage.getItem('orderByDirection');
        if (!!orderByDirectionString) {
            this._orderByDirection = orderByDirectionString as 'asc' | 'desc';
        }

        const hiddenColumnsString = this._localStorage.getItem('hiddenColumns');
        if (!!hiddenColumnsString) {
            this._hiddenColumns = hiddenColumnsString.split('|');
        }
    }

    hideColumn(name: string) {
        this._hiddenColumns.push(name);
        this._localStorage.setItem('hiddenColumns', this._hiddenColumns.join('|'));
    }

    unhide() {
        this._hiddenColumns = [];
        this._localStorage.removeItem('hiddenColumns');

        this._refresh();
    }

    resetOrderBy() {
        this._orderBy = '';
        this._orderByDirection = 'asc';
        this._refresh();
    }

    reset() {

        this._orchestrations = [];
        this._noMorePagesToLoad = false;
    }

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean = false): Promise<void> {

        if (isAutoRefresh) { 

            this._noMorePagesToLoad = false;

        } else {

            if (!!this._noMorePagesToLoad) {
                return Promise.resolve();
            }

            // persisting state as a batch
            this._localStorage.setItems([
                { fieldName: 'orderBy', value: this._orderBy },
                { fieldName: 'orderByDirection', value: this._orderByDirection },
            ]);            
        }

        // In auto-refresh mode only refreshing the first page
        const skip = isAutoRefresh ? 0 : this._orchestrations.length;

        const orderByClause = !!this._orderBy ? `&$orderby=${this._orderBy} ${this.orderByDirection}` : '';
        const hiddenColumnsClause = !this._hiddenColumns.length ? '' : `&hidden-columns=${this._hiddenColumns.join('|')}`;

        const uri = `/orchestrations?$top=${this._pageSize}&$skip=${skip}${filterClause}${orderByClause}${hiddenColumnsClause}`;

        return this._backendClient.call('GET', uri).then(response => {

            if (cancelToken.isCancelled) {
                return;
            }
            
            if (isAutoRefresh) {
                this._orchestrations = response;
            } else {
                this._orchestrations.push(...response);
            }

            if (!response.length) {

                // Stop the infinite scrolling
                this._noMorePagesToLoad = true;
            }
        });
    }

    @observable
    private _orchestrations: DurableOrchestrationStatus[] = [];
    @observable
    private _orderByDirection: ('asc' | 'desc') = 'asc';
    @observable
    private _orderBy: string = '';

    @observable
    private _hiddenColumns: string[] = [];

    private _noMorePagesToLoad: boolean = false;
    private readonly _pageSize = 50;
}