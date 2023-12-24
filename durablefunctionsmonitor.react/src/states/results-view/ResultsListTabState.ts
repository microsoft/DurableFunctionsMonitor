// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { IBackendClient } from '../../services/IBackendClient';
import { CancelToken } from '../../CancelToken';

import { dfmContextInstance } from '../../DfmContext';
import { DateTimeHelpers } from 'src/DateTimeHelpers';
import { QueryString } from '../QueryString';
import { LongJsonDialogState } from '../dialogs/LongJsonDialogState';

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

    readonly longJsonDialogState: LongJsonDialogState;

    constructor(private _backendClient: IBackendClient, private _refresh: () => void) {

        this.longJsonDialogState = new LongJsonDialogState(this._backendClient);

        const queryString = new QueryString();
        
        this._orderBy = queryString.values['orderBy'] ?? '';

        const orderByDirectionString = queryString.values['orderByDirection'];
        if (!!orderByDirectionString) {
            this._orderByDirection = orderByDirectionString as 'asc' | 'desc';
        }

        const hiddenColumnsString = queryString.values['hiddenColumns'];
        if (!!hiddenColumnsString) {
            this._hiddenColumns = hiddenColumnsString.split('|');
        }

        this.clientFilteredColumn = queryString.values['clientFilteredColumn'] ?? '';
        this.clientFilterValue = queryString.values['clientFilterValue'] ?? '';
    }

    hideColumn(name: string) {
        this._hiddenColumns.push(name);

        const queryString = new QueryString();
        queryString.setValue('hiddenColumns', this._hiddenColumns.join('|'));
        queryString.apply(true);
    }

    unhide() {
        this._hiddenColumns = [];

        const queryString = new QueryString();
        queryString.setValue('hiddenColumns', null);
        queryString.apply(true);

        this._refresh();
    }

    resetOrderBy() {
        this._orderBy = '';
        this._orderByDirection = 'asc';
        this._refresh();
    }

    setClientFilteredColumn(name: string) {
        
        this.clientFilteredColumn = name;
        this.clientFilterValue = '';
    }

    applyFilter() {

        if (this._prevFilterValue !== this.clientFilterValue) {
           
            this._refresh();
        }
    }

    resetFilter() {
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

            const queryString = new QueryString();

            queryString.setValue('orderBy', this._orderBy);
            queryString.setValue('orderByDirection', this._orderByDirection);
            queryString.setValue('clientFilteredColumn', this.clientFilteredColumn);
            queryString.setValue('clientFilterValue', this.clientFilterValue);

            queryString.apply(true);
        }

        const orderByClause = !!this._orderBy ? `&$orderby=${this._orderBy} ${this.orderByDirection}` : '';
        const hiddenColumnsClause = !this._hiddenColumns.length ? '' : `&hidden-columns=${this._hiddenColumns.join('|')}`;
        const uri = `/orchestrations?$top=${this._pageSize}${filterClause}${orderByClause}${hiddenColumnsClause}`;
        
        return this.loadFiltered(uri, cancelToken, []).then(response => {

            this._prevFilterValue = this.clientFilterValue;

            if (cancelToken.isCancelled) {
                return;
            }
            
            if (!!isAutoRefresh) {
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

    private loadFiltered(uri: string, cancelToken: CancelToken, result: DurableOrchestrationStatus[]): Promise<DurableOrchestrationStatus[]> {

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
                
                return this.loadFiltered(uri, cancelToken, result);
            }

            return Promise.resolve(result);
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
    private _skip = 0;
    private _prevFilterValue = '';
}