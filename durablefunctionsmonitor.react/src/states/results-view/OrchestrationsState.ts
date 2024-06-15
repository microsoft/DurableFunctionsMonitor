// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx';
import moment from 'moment';

import { DateTimeHelpers } from '../../DateTimeHelpers';
import { ErrorMessageState } from '../ErrorMessageState';
import { IBackendClient } from '../../services/IBackendClient';
import { ITypedLocalStorage } from '../ITypedLocalStorage';
import { CancelToken } from '../../CancelToken';
import { IResultsTabState, ResultsListTabState } from './ResultsListTabState';
import { ResultsGanttDiagramTabState } from './ResultsGanttDiagramTabState';
import { ResultsHistogramTabState } from './ResultsHistogramTabState';
import { ResultsFunctionGraphTabState } from './ResultsFunctionGraphTabState';
import { RuntimeStatus } from '../DurableOrchestrationStatus';
import { QueryString } from '../QueryString';
import { FilterOperatorEnum, toOdataFilterQuery } from '../FilterOperatorEnum';

export enum ResultsTabEnum {
    List = 0,
    Histogram,
    Gantt,
    FunctionGraph
}

export enum TimeRangeEnum {
    Custom = 0,
    LastMinute,
    Last10Minutes,
    LastHour,
    Last24Hours,
    Last7Days,
    Last30Days,
    Last90Days
}

export type RuntimeStatusOrDurableEntities = RuntimeStatus | 'DurableEntities';

// State of Orchestrations view
export class OrchestrationsState extends ErrorMessageState {

    // Tab currently selected
    @computed
    get tabIndex(): ResultsTabEnum { return this._tabIndex; }
    set tabIndex(val: ResultsTabEnum) {

        if (this._tabIndex === val) {
            return;
        }

        this._tabIndex = val;
        this._localStorage.setItem('tabIndex', val.toString());

        this.reloadOrchestrations();
    }

    get selectedTabState(): IResultsTabState {
        return this._tabStates[this._tabIndex];
    }

    @computed
    get inProgress(): boolean { return this._cancelToken.inProgress && !this._cancelToken.isCancelled; }

    @computed
    get autoRefresh(): number { return this._autoRefresh; }
    set autoRefresh(val: number) {
        this._autoRefresh = val;
        this._localStorage.setItem('autoRefresh', this._autoRefresh.toString());
        this.loadOrchestrations(true);
    }

    @computed
    get timeFrom(): moment.Moment {
        return this.getTimeFrom();
    }
    set timeFrom(val: moment.Moment) {

        this._timeFrom = val;
        this._timeRange = TimeRangeEnum.Custom;
    }

    @computed
    get timeTill(): moment.Moment {
        return this.getTimeTill();
    }
    set timeTill(val: moment.Moment) {
        this._timeTill = val;
        this._timeRange = TimeRangeEnum.Custom;
    }
    
    @computed
    get timeTillEnabled(): boolean { return !!this._timeTill; }
    set timeTillEnabled(val: boolean) {

        this._timeTill = val ? moment() : null;

        if (!val) {
            this.reloadOrchestrations();
        }
    }

    @computed
    get timeRange(): TimeRangeEnum { return this._timeRange; }
    set timeRange(val: TimeRangeEnum) {

        this.menuAnchorElement = undefined;
        
        this._timeRange = val;

        this.reloadOrchestrations();
    }

    @observable
    menuAnchorElement?: Element;

    @computed
    get filterValue(): string { return this._filterValue; }
    set filterValue(val: string) { this._filterValue = val; }

    @computed
    get filterOperator(): FilterOperatorEnum { return this._filterOperator; }
    set filterOperator(val: FilterOperatorEnum) {
        
        this._filterOperator = val;

        if (!!this._filterValue && this._filteredColumn !== '0') {

            this.reloadOrchestrations();
        }
    }

    @computed
    get filteredColumn(): string { return this._filteredColumn; }
    set filteredColumn(val: string) {

        this._filteredColumn = val;

        if (!this._filterValue) {
            return;
        }

        if (this._filteredColumn === '0') {
            this._filterValue = '';
        }

        this.reloadOrchestrations();
    }

    @computed
    get showStatuses(): RuntimeStatusOrDurableEntities[] { return this._showStatuses; }
    set showStatuses(val: RuntimeStatusOrDurableEntities[]) { this._showStatuses = val; }

    @computed
    get isStatusSelectOpen(): boolean { return this._isStatusSelectOpen; }
    set isStatusSelectOpen(val)
    {
        this._isStatusSelectOpen = val;

        if (!this._isStatusSelectOpen) {
            this.reloadOrchestrations();
        }
    }

    @computed
    get filteredOutColumns(): string[] {

        // Only showing those fields when being filtered by them (because otherwise it is not populated on the server)
        const result = ['lastEvent', 'parentInstanceId'];

        if (!!this._oldFilterValue) {

            const i = result.indexOf(this._filteredColumn);
            if (i >= 0) {
                
                result.splice(i, 1)
            }
        }
        
        return result;
    }

    get backendClient(): IBackendClient { return this._backendClient; }

    get isFunctionGraphAvailable(): boolean { return this._isFunctionGraphAvailable; }

    constructor(private _isFunctionGraphAvailable: boolean,
        private _backendClient: IBackendClient,
        private _localStorage: ITypedLocalStorage<OrchestrationsState & ResultsListTabState>,
        private _startNewInstance: (funcName) => void
    ) {
        super();
        
        this._tabStates = [
            new ResultsListTabState(
                this._backendClient,
                this._localStorage,
                () => this.reloadOrchestrations(),
                () => this.getFilterClause(),
                () => this._cancelToken,
                () => { this._autoRefresh = 0; },
                (msg, err) => this.showError(msg, err)
            ),
            new ResultsHistogramTabState(this._backendClient, this),
            new ResultsGanttDiagramTabState(this._backendClient)
        ];

        if (!!this._isFunctionGraphAvailable) {
            this._tabStates.push(new ResultsFunctionGraphTabState(this._backendClient, this._startNewInstance));
        }

        var momentFrom: moment.Moment;
        const timeFromString = this._localStorage.getItem('timeFrom');
        if (!!timeFromString) {
            momentFrom = moment(timeFromString);
        } else {
            // By default setting it to 24 hours ago
            momentFrom = moment().subtract(1, 'days');
        }

        this._timeFrom = momentFrom;
        this._oldTimeFrom = momentFrom;
       
        const timeTillString = this._localStorage.getItem('timeTill');
        if (!!timeTillString) {
            this._timeTill = moment(timeTillString);
            this._oldTimeTill = this._timeTill;
        }

        const timeRangeString = this._localStorage.getItem('timeRange');
        if (!!timeRangeString) {

            // timeRange and [timeFrom,timeTill] are mutually exclusive.
            // So when the latter comes from query string, we should not pay attention to the former.
            const queryString = new QueryString();
            if (!queryString.values['timeFrom'] && !queryString.values['timeTill']) {   
                this._timeRange = TimeRangeEnum[timeRangeString];
            }
        }

        const filteredColumnString = this._localStorage.getItem('filteredColumn');
        if (!!filteredColumnString) {
            this._filteredColumn = filteredColumnString;
        }

        const filterOperatorString = this._localStorage.getItem('filterOperator');
        if (!!filterOperatorString) {
            this._filterOperator = FilterOperatorEnum[filterOperatorString];
        }

        const filterValueString = this._localStorage.getItem('filterValue');
        if (!!filterValueString) {
            this._filterValue = filterValueString;
            this._oldFilterValue = filterValueString;
        }

        const showStatusesString = this._localStorage.getItem('showStatuses');
        if (!!showStatusesString) {
            this._showStatuses = JSON.parse(showStatusesString);
        }
        
        const autoRefreshString = this._localStorage.getItem('autoRefresh');
        if (!!autoRefreshString) {
            this._autoRefresh = Number(autoRefreshString);
        }

        const tabIndexString = this._localStorage.getItem('tabIndex');
        if (!!tabIndexString) {
            const tabIndex = Number(tabIndexString);
            if (tabIndex >= 0 && tabIndex < this._tabStates.length) {
                this._tabIndex = tabIndex;
            }
        }
    }

    applyTimeFrom() {
        if (DateTimeHelpers.isValidMoment(this._timeFrom) && this._oldTimeFrom !== this._timeFrom) {
            this.reloadOrchestrations();
        }
    }

    applyTimeTill() {
        if (DateTimeHelpers.isValidMoment(this._timeTill) && this._oldTimeTill !== this._timeTill) {
            this.reloadOrchestrations();
        }
    }

    applyFilterValue() {
        if (this._oldFilterValue !== this._filterValue) {
            this.reloadOrchestrations();
        }
    }

    reloadOrchestrations() {

        // Canceling delayed refresh, if any
        if (!!this._refreshToken) {
            clearTimeout(this._refreshToken);
            this._refreshToken = null;
        }

        for (const resultState of this._tabStates) {
            resultState.reset();
        }

        // If dates are invalid, reverting them to previous valid values
        if (!DateTimeHelpers.isValidMoment(this._timeFrom)) {
            this._timeFrom = this._oldTimeFrom;
        }
        if (!!this._timeTill && !DateTimeHelpers.isValidMoment(this._timeTill)) {
            this._timeTill = this._oldTimeTill;
        }

        // persisting state as a batch
        this._localStorage.setItems([
            { fieldName: 'timeFrom', value: !this._timeRange ? this._timeFrom.toISOString(): null },
            { fieldName: 'timeTill', value: (!!this._timeTill && !this._timeRange) ? this._timeTill.toISOString() : null },
            { fieldName: 'timeRange', value: !!this._timeRange ? TimeRangeEnum[this._timeRange] : null },
            { fieldName: 'filteredColumn', value: this._filteredColumn },
            { fieldName: 'filterOperator', value: FilterOperatorEnum[this._filterOperator] },
            { fieldName: 'filterValue', value: !!this._filterValue ? this._filterValue : null },
            { fieldName: 'showStatuses', value: !!this._showStatuses ? JSON.stringify(this._showStatuses) : null },
        ]);

        this.loadOrchestrations();

        this._oldFilterValue = this._filterValue;
        this._oldTimeFrom = this._timeFrom;
        this._oldTimeTill = this._timeTill;
    }

    cancel() {
        this._cancelToken.isCancelled = true;
        this._cancelToken = new CancelToken();
    }

    loadOrchestrations(isAutoRefresh: boolean = false) {

        const cancelToken = this._cancelToken;
        if (!!cancelToken.inProgress) {
            return;            
        }
        cancelToken.inProgress = true;

        this.selectedTabState.load(this.getFilterClause(), cancelToken, isAutoRefresh).then(() => {

            if (!!this._refreshToken) {
                clearTimeout(this._refreshToken);
            }

            // Doing auto-refresh
            if (!!this._autoRefresh) {

                this._refreshToken = setTimeout(() => {

                    if (!!this._autoRefresh) {

                        this.loadOrchestrations(true);
                    }

                }, this._autoRefresh * 1000);
            }

        }, err => {

            // Cancelling auto-refresh just in case
            this._autoRefresh = 0;

            if (!cancelToken.isCancelled) {
                this.showError('Load failed', err);
            }
                
        }).finally(() => {
            cancelToken.inProgress = false;
        });
    }

    @observable
    private _tabIndex: ResultsTabEnum = ResultsTabEnum.List;

    @observable
    private _cancelToken: CancelToken = new CancelToken();

    @observable
    private _autoRefresh: number = 0;

    @observable
    private _timeFrom: moment.Moment;
    @observable
    private _timeTill: moment.Moment;
    @observable
    private _timeRange: TimeRangeEnum = TimeRangeEnum.Custom;

    @observable
    private _filterValue: string = '';
    @observable
    private _oldFilterValue: string = '';
    @observable
    private _filterOperator: FilterOperatorEnum = FilterOperatorEnum.Equals;
    @observable
    private _filteredColumn: string = '0';

    @observable
    private _showStatuses: RuntimeStatusOrDurableEntities[] = null;

    @observable
    private _isStatusSelectOpen: boolean = false;

    private readonly _tabStates: IResultsTabState[];

    private _refreshToken: NodeJS.Timeout;

    private _oldTimeFrom: moment.Moment;
    private _oldTimeTill: moment.Moment;

    // turned out computed properties are memoized, so need to implement this as a method (so that current timestamp is properly returned)
    private getTimeFrom(): moment.Moment {
        switch (this._timeRange) {
            case TimeRangeEnum.LastMinute:
                return moment().subtract(1, 'minutes');
            case TimeRangeEnum.Last10Minutes:
                return moment().subtract(10, 'minutes');
            case TimeRangeEnum.LastHour:
                return moment().subtract(1, 'hours');
            case TimeRangeEnum.Last24Hours:
                return moment().subtract(1, 'days');
            case TimeRangeEnum.Last7Days:
                return moment().subtract(7, 'days');
            case TimeRangeEnum.Last30Days:
                return moment().subtract(30, 'days');
            case TimeRangeEnum.Last90Days:
                return moment().subtract(90, 'days');
            default:
                return this._timeFrom;
        }
    }

    // turned out computed properties are memoized, so need to implement this as a method (so that current timestamp is properly returned)
    private getTimeTill(): moment.Moment {
        return (!!this._timeRange || !this._timeTill) ? moment() : this._timeTill;
    }

    private getFilterClause(): string {

        let filterClause = `&$filter=createdTime ge '${this.getTimeFrom().toISOString()}' and createdTime le '${this.getTimeTill().toISOString()}'`;
        
        if (!!this._showStatuses) {

            filterClause += ` and runtimeStatus in (${this._showStatuses.map(s => `'${s}'`).join(',')})`;
        }
        
        const columnFilter = toOdataFilterQuery(this._filteredColumn, this._filterOperator, this._filterValue);
        if (!!columnFilter) {
            
            filterClause += ' and ' + columnFilter;
        }

        return filterClause;
    }
}