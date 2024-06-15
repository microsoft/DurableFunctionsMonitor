// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { IBackendClient } from '../../services/IBackendClient';
import { CancelToken } from '../../CancelToken';

import { dfmContextInstance } from '../../DfmContext';
import { DateTimeHelpers } from 'src/DateTimeHelpers';
import { LongJsonDialogState } from '../dialogs/LongJsonDialogState';
import { ITypedLocalStorage } from '../ITypedLocalStorage';

// Represents the state of a tab in the results pane
export interface IResultsTabState {

    reset(): void;

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean): Promise<void>;
}

// Resulting list of orchestrations represented as a plain table
export class ResultsListTabState implements IResultsTabState {

    @observable
    columnUnderMouse: string;

    @observable
    clientFilteredColumn: string;

    @observable
    clientFilterValue: string;

    @computed
    get hiddenColumns(): string[] { return this._hiddenColumns; }

    @computed
    get orchestrations(): DurableOrchestrationStatus[] {
        return this._orchestrations;
    }

    @computed
    get orderByDirection(): ('asc' | 'desc') {
        return this._orderByDirection;
    }

    @computed
    get orderBy(): string {
        return this._orderBy;
    }
    set orderBy(val: string) {

        if (!!this._getCancelToken().inProgress) {
            return;
        }

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

    @computed
    get noMorePagesToLoad(): boolean { return this._noMorePagesToLoad; }

    get backendClient(): IBackendClient { return this._backendClient; }

    readonly longJsonDialogState: LongJsonDialogState;

    constructor(private _backendClient: IBackendClient,
        private _localStorage: ITypedLocalStorage<ResultsListTabState>,
        private _refresh: () => void,
        private _getFilterClause: () => string,
        private _getCancelToken: () => CancelToken,
        private _cancelAutoRefresh: () => void,
        private _showError: (msg: string, err: any) => void
    ) {

        this.longJsonDialogState = new LongJsonDialogState(this._backendClient);

        this._orderBy = this._localStorage.getItem('orderBy') ?? '';

        const orderByDirectionString = this._localStorage.getItem('orderByDirection');
        if (!!orderByDirectionString) {
            this._orderByDirection = orderByDirectionString as 'asc' | 'desc';
        }

        const hiddenColumnsString = this._localStorage.getItem('hiddenColumns');
        if (!!hiddenColumnsString) {
            this._hiddenColumns = hiddenColumnsString.split('|');
        }

        this.clientFilteredColumn = this._localStorage.getItem('clientFilteredColumn') ?? '';
        this.clientFilterValue = this._localStorage.getItem('clientFilterValue') ?? '';
    }

    hideColumn(name: string) {
        this._hiddenColumns.push(name);

        this._localStorage.setItem('hiddenColumns', this._hiddenColumns.join('|'));
    }

    unhide() {

        if (!!this._getCancelToken().inProgress) {
            return;
        }

        this._hiddenColumns = [];

        this._localStorage.removeItem('hiddenColumns');

        this._refresh();
    }

    resetOrderBy() {

        if (!!this._getCancelToken().inProgress) {
            return;
        }

        this._orderBy = '';
        this._orderByDirection = 'asc';
        this._refresh();
    }

    setClientFilteredColumn(name: string) {

        if (!!this._getCancelToken().inProgress) {
            return;
        }
        
        this.clientFilteredColumn = name;
        this.clientFilterValue = '';
    }

    applyFilter() {

        if (!!this._getCancelToken().inProgress) {
            return;
        }

        if (this._prevFilterValue !== this.clientFilterValue) {
           
            this._refresh();
        }
    }

    resetFilter() {

        if (!!this._getCancelToken().inProgress) {
            return;
        }

        this.clientFilteredColumn = '';
        this.clientFilterValue = '';
        this._prevFilterValue = '';
        this._refresh();
    }

    reset() {

        this._orchestrations = [];
        this._noMorePagesToLoad = false;
        this._skip = 0;
    }

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean = false): Promise<void> {

        if (isAutoRefresh) { 

            this._noMorePagesToLoad = false;

            // With auto-refresh always loading just the first page
            this._skip = 0;

        } else {

            if (!!this._noMorePagesToLoad) {
                return Promise.resolve();
            }

            this._localStorage.setItems([
                { fieldName: 'orderBy', value: this._orderBy },
                { fieldName: 'orderByDirection', value: this._orderByDirection },
                { fieldName: 'clientFilteredColumn', value: this.clientFilteredColumn },
                { fieldName: 'clientFilterValue', value: this.clientFilterValue },
            ]);
        }

        const orderByClause = !!this._orderBy ? `&$orderby=${this._orderBy} ${this.orderByDirection}` : '';
        const hiddenColumnsClause = !this._hiddenColumns.length ? '' : `&hidden-columns=${this._hiddenColumns.join('|')}`;
        const uri = `/orchestrations?$top=${this._pageSize}${filterClause}${orderByClause}${hiddenColumnsClause}`;

        const result: DurableOrchestrationStatus[] = [];
        const keepFetching = () => {

            return this._backendClient.call('GET', uri + `&$skip=${this._skip}`).then(response => {

                if (!!cancelToken.isCancelled || !response || !response.length) {
                    
                    return Promise.resolve(result);
                }

                this._skip += response.length;

                if (!!this.clientFilteredColumn && !!this.clientFilterValue) {
                    
                    // applying client-side filter
                    response = response.filter(item => {

                        const itemValue = item[this.clientFilteredColumn];
                        if (!itemValue) {
                            return false;
                        }

                        var itemValueString;
                        switch (this.clientFilteredColumn) {
                            case 'createdTime':
                            case 'lastUpdatedTime':
                                itemValueString = dfmContextInstance.formatDateTimeString(itemValue);
                                break;
                            case 'duration':
                                itemValueString = DateTimeHelpers.formatDuration(itemValue);
                                break;
                            case 'input':
                            case 'output':
                            case 'customStatus':
                                itemValueString = JSON.stringify(itemValue);
                                break;
                            default:
                                itemValueString = itemValue.toString();
                        }

                        return itemValueString.toLowerCase().includes(this.clientFilterValue.toLowerCase());
                    });
                }

                result.push(...response);

                // Keep pulling data until we get at least this._pageSize results
                if (result.length < this._pageSize) {
                    
                    return keepFetching();
                }

                return Promise.resolve(result);
            });
        }

        return keepFetching().then(response => {

            this._prevFilterValue = this.clientFilterValue;

            if (cancelToken.isCancelled) {
                return;
            }
            
            if (!!isAutoRefresh) {
                this._orchestrations = response;
            } else {
                this._orchestrations.push(...response);
            }

            // Making an educated guess whether there're any more pages or not
            if (response.length < this._pageSize) {

                // Stop the infinite scrolling
                this._noMorePagesToLoad = true;
            }
        });
    }

    fetchNextPage() {

        const cancelToken = this._getCancelToken();
        if (!!cancelToken.inProgress) {
            return;            
        }
        cancelToken.inProgress = true;
        this._cancelAutoRefresh();

        this.load(this._getFilterClause(), cancelToken).then(() => { 
            
        }, err => { 

            if (!cancelToken.isCancelled) {
                this._showError('Load failed', err);
            }

        }).finally(() => { 

            cancelToken.inProgress = false;
        });
    }

    fetchAllPages() {

        const cancelToken = this._getCancelToken();
        if (!!cancelToken.inProgress) {
            return;            
        }
        cancelToken.inProgress = true;

        const keepFetching = () => {

            this._cancelAutoRefresh();

            return this.load(this._getFilterClause(), cancelToken).then(() => {

                if (!cancelToken.isCancelled && !this._noMorePagesToLoad) {
                    
                    return keepFetching();
                }
            });
        };

        keepFetching().then(() => { 
            
        }, err => { 

            if (!cancelToken.isCancelled) {
                this._showError('Load failed', err);
            }

        }).finally(() => { 

            cancelToken.inProgress = false;
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

    @observable
    private _noMorePagesToLoad: boolean = false;
    
    private readonly _pageSize = 50;
    private _skip = 0;
    private _prevFilterValue = '';
}