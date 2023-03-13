// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx';
import moment from 'moment';

import { DurableOrchestrationStatus, HistoryEvent } from '../DurableOrchestrationStatus';
import { ErrorMessageState } from '../ErrorMessageState';
import { IBackendClient } from '../../services/IBackendClient';
import { ITypedLocalStorage } from '../ITypedLocalStorage';
import { SequenceDiagramTabState } from './SequenceDiagramTabState';
import { FunctionGraphTabState } from './FunctionGraphTabState';
import { ICustomTabState } from './ICustomTabState';
import { GanttDiagramTabState } from './GanttDiagramTabState';
import { LiquidMarkupTabState } from './LiquidMarkupTabState';
import { CancelToken } from '../../CancelToken';
import { FunctionsMap } from 'az-func-as-a-graph.core/dist/FunctionsMap';
import { FilterOperatorEnum, toOdataFilterQuery } from '../FilterOperatorEnum';
import { QueryString } from '../QueryString';
import { DateTimeHelpers } from '../../DateTimeHelpers';

// State of OrchestrationDetails view
export class OrchestrationDetailsState extends ErrorMessageState {

    // Tab currently selected
    @computed
    get tabIndex(): number { return this._tabIndex; }
    set tabIndex(val: number) {

        if (this._tabIndex === val) {
            return;
        }

        this._tabIndex = val;
        this._localStorage.setItem('tabIndex', val.toString());

        if (!!this.selectedTab) {

            this.loadCustomTab();

        } else if (!this._history.length) {

            this.loadHistory();
        }
    }

    get selectedTab(): ICustomTabState {
        return !this._tabIndex ? null : this._tabStates[this._tabIndex - 1];
    }

    @computed
    get details(): DurableOrchestrationStatus { return this._details; }

    @computed
    get history(): HistoryEvent[] { return this._history; }

    @computed
    get historyTotalCount(): number { return this._historyTotalCount; }

    @computed
    get orchestrationId(): string { return this._orchestrationId; }

    @computed
    get loadInProgress(): boolean { return this._cancelToken.inProgress && !this._cancelToken.isCancelled; }

    @computed
    get inProgress(): boolean { return this._inProgress || this.loadInProgress; };

    @computed
    get autoRefresh(): number { return this._autoRefresh; }
    set autoRefresh(val: number) {
        this._autoRefresh = val;
        this._localStorage.setItem('autoRefresh', this._autoRefresh.toString());
        this.loadDetails();
    }

    @computed
    get raiseEventDialogOpen(): boolean { return this._raiseEventDialogOpen; }
    set raiseEventDialogOpen(val: boolean) {
        this._raiseEventDialogOpen = val;
        if (!!val) {
            this.eventName = '';
            this.eventData = '';
        }
    }

    @computed
    get setCustomStatusDialogOpen(): boolean { return this._setCustomStatusDialogOpen; }
    set setCustomStatusDialogOpen(val: boolean) {
        this._setCustomStatusDialogOpen = val;
        if (!!val) {
            this.newCustomStatus = !!this._details.customStatus ? JSON.stringify(this._details.customStatus) : '';
        }
    }

    @computed
    get restartDialogOpen(): boolean { return this._restartDialogOpen; }
    set restartDialogOpen(val: boolean) {
        this._restartDialogOpen = val;
        if (!!val) {
            this.restartWithNewInstanceId = true;
        }
    }

    @computed
    get suspendDialogOpen(): boolean { return this._suspendDialogOpen; }
    set suspendDialogOpen(val: boolean) {
        this._suspendDialogOpen = val;
        if (!!val) {
            this.suspendResumeReason = '';
        }
    }

    @computed
    get resumeDialogOpen(): boolean { return this._resumeDialogOpen; }
    set resumeDialogOpen(val: boolean) {
        this._resumeDialogOpen = val;
        if (!!val) {
            this.suspendResumeReason = '';
        }
    }

    @computed
    get isCustomStatusDirty(): boolean { 

        if (!this._details.customStatus) {
            return !!this.newCustomStatus;
        }

        return this.newCustomStatus !== JSON.stringify(this._details.customStatus);
    }

    @computed
    get functionNames(): { [name: string]: any } { return this._functionMap; };

    @computed
    get eventNames(): string[] {

        const result: string[] = [];

        for (const name in this._functionMap) {
            
            const func = this._functionMap[name];

            if (!!func.isSignalledBy) {

                for (const signalledBy of func.isSignalledBy) {
                    
                    result.push(signalledBy.signalName);
                }                
            }
        }

        return result;
    };

    @computed
    get timeFrom(): moment.Moment { return this._timeFrom; }
    set timeFrom(val: moment.Moment) { this._timeFrom = val; }

    @computed
    get timeFromEnabled(): boolean { return !!this._timeFrom; }
    set timeFromEnabled(val: boolean) {

        if (!!val) {

            if (this._history.length > 0) {
                
                this._timeFrom = moment(this._history[0].Timestamp);

            } else {

                this._timeFrom = moment();
            }

        } else {

            this._timeFrom = null;
            this.reloadHistory();
        }
    }

    @computed
    get filterValue(): string { return this._filterValue; }
    set filterValue(val: string) { this._filterValue = val; }

    @computed
    get filterOperator(): FilterOperatorEnum { return this._filterOperator; }
    set filterOperator(val: FilterOperatorEnum) {
        
        this._filterOperator = val;

        if (!!this._filterValue && this._filteredColumn !== '0') {

            this.reloadHistory();
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

        this.reloadHistory();
    }

    @observable
    rewindConfirmationOpen: boolean = false;
    @observable
    terminateConfirmationOpen: boolean = false;
    @observable
    purgeConfirmationOpen: boolean = false;

    @observable
    suspendResumeReason: string;
    @observable
    eventName: string;
    @observable
    eventData: string;
    @observable
    newCustomStatus: string;
    @observable
    restartWithNewInstanceId: boolean = true;

    @observable
    longJsonDialogState = {};

    @computed
    get tabStates(): ICustomTabState[] { return this._tabStates; }

    get backendClient(): IBackendClient { return this._backendClient; }

    constructor(private _orchestrationId: string,
        private _isFunctionGraphAvailable: boolean,
        private _backendClient: IBackendClient,
        private _localStorage: ITypedLocalStorage<OrchestrationDetailsState>) {
        super();

        const autoRefreshString = this._localStorage.getItem('autoRefresh');
        if (!!autoRefreshString) {
            this._autoRefresh = Number(autoRefreshString);
        }

        const tabIndexString = this._localStorage.getItem('tabIndex');
        if (!!tabIndexString) {
            this._tabIndex = Number(tabIndexString);
        }

        // Storing filter in query string only. Don't want it to stick to every instance in VsCode.
        this.readFilterFromQueryString();
    }

    rewind() {
        this.rewindConfirmationOpen = false;

        const uri = `/orchestrations('${this._orchestrationId}')/rewind`;
        this._inProgress = true;

        this._backendClient.call('POST', uri).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError('Failed to rewind', err);
        });
    }

    terminate() {
        this.terminateConfirmationOpen = false;

        const uri = `/orchestrations('${this._orchestrationId}')/terminate`;
        this._inProgress = true;

        this._backendClient.call('POST', uri).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError('Failed to terminate', err);
        });
    }

    purge() {
        this.purgeConfirmationOpen = false;

        const uri = `/orchestrations('${this._orchestrationId}')/purge`;
        this._inProgress = true;

        this._backendClient.call('POST', uri).then(() => {
            this._inProgress = false;
            this._history = [];
            this._details = new DurableOrchestrationStatus();
            this._tabStates = [];
        }, err => {
            this._inProgress = false;
            this.showError('Failed to purge', err);
        });
    }

    restart() {

        const uri = `/orchestrations('${this._orchestrationId}')/restart`;
        const requestBody = { restartWithNewInstanceId: this.restartWithNewInstanceId };

        this.restartDialogOpen = false;
        this._inProgress = true;

        this._backendClient.call('POST', uri, requestBody).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError('Failed to restart', err);
        });
    }

    raiseEvent() {

        const uri = `/orchestrations('${this._orchestrationId}')/raise-event`;
        const requestBody = { name: this.eventName, data: null };

        try {
            requestBody.data = JSON.parse(this.eventData);
        } catch (err) {
            this.showError('Failed to parse event data', err);
            return;
        } finally {
            this.raiseEventDialogOpen = false;
        }

        this._inProgress = true;

        this._backendClient.call('POST', uri, requestBody).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError('Failed to raise an event', err);
        });
    }

    setCustomStatus() {

        const uri = `/orchestrations('${this._orchestrationId}')/set-custom-status`;
        var requestBody = null;

        try {

            if (!!this.newCustomStatus) {
                requestBody = JSON.parse(this.newCustomStatus);
            }

        } catch (err) {
            this.showError('Failed to parse custom status', err);
            return;
        } finally {
            this.setCustomStatusDialogOpen = false;
        }

        this._inProgress = true;

        this._backendClient.call('POST', uri, requestBody).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError('Failed to set custom status', err);
        });
    }

    suspendResume(resume: boolean) {

        const uri = `/orchestrations('${this._orchestrationId}')/${!!resume ? 'resume' : 'suspend'}`;

        this.suspendDialogOpen = false;
        this.resumeDialogOpen = false;
        this._inProgress = true;

        this._backendClient.call('POST', uri, this.suspendResumeReason).then(() => {
            this._inProgress = false;
            this.loadDetails();
        }, err => {
            this._inProgress = false;
            this.showError(`Failed to ${!!resume ? 'resume' : 'suspend'}`, err);
        });
    }

    loadDetails() {

        if (!!this.inProgress) { // We might end up here, if next timer occurs while a custom tab is still loading
            // Doing auto-refresh
            this.setAutoRefresh();
            return;
        }

        this._inProgress = true;
        this._noMorePagesToLoad = false;

        if (!this._autoRefresh && (!this.selectedTab)) {
            
            this._history = [];
            this._historyTotalCount = 0;
        }

        const functionMapPromise = !!this._isFunctionGraphAvailable ? this._backendClient.call('GET', `/function-map`) : Promise.resolve(null);

        const uri = `/orchestrations('${this._orchestrationId}')`;
        return Promise.all([this._backendClient.call('GET', uri), functionMapPromise]).then(responses => {
        
            this._details = responses[0];
            const traversalResult = responses[1];

            // Doing auto-refresh
            this.setAutoRefresh();

            var tabStateIndex = 0;

            // Loading sequence diagram tab
            if (this._details.entityType === "Orchestration") {
               
                if (this._tabStates.length <= tabStateIndex) {
                    this._tabStates.push(new SequenceDiagramTabState((orchId) => this.loadAllHistory(orchId)));
                    this._tabStates.push(new GanttDiagramTabState((orchId) => this.loadAllHistory(orchId)));
                }
                tabStateIndex += 2;
            }

            // Functions Graph tab
            if (!!traversalResult) {

                this._functionMap = traversalResult.functions;

                const functionName = DurableOrchestrationStatus.getFunctionName(this._details);
        
                // Entities have their names lowered, so we need to do a case-insensitive match
                const shownFunctionNames = Object.keys(traversalResult.functions).map(fn => fn.toLowerCase());
                
                // Only showing Functions Graph, if currently opened instance is shown on it
                if (shownFunctionNames.includes(functionName.toLowerCase())) {
                    
                    if (this._tabStates.length <= tabStateIndex) {
                        this._tabStates.push(new FunctionGraphTabState(this._backendClient, traversalResult, (orchId) => this.loadAllHistory(orchId)));
                    }
                    tabStateIndex++;
                }
            }

            // Loading custom tabs
            if (!!this._details.tabTemplateNames) {
                for (var templateName of this._details.tabTemplateNames) {

                    if (this._tabStates.length <= tabStateIndex) {
                        this._tabStates.push(new LiquidMarkupTabState(this._orchestrationId, this._backendClient));
                    }
                    this._tabStates[tabStateIndex].name = templateName;
                    tabStateIndex++;
                }                
            }

            // Ensuring tab index does not go out of sync
            if (this._tabIndex < 0 || this._tabIndex > this._tabStates.length) {
                this._tabIndex = 0;
            }

            this._inProgress = false;

            if (!this.selectedTab) {
                
                this.loadHistory(!!this._autoRefresh);

            } else {

                this.loadCustomTab();
            }
            
        }, err => {
            this._inProgress = false;

            // Cancelling auto-refresh just in case
            this._autoRefresh = 0;

            this.showError('Load failed', err);
        });
    }

    cancel() {
        this._cancelToken.isCancelled = true;
        this._cancelToken = new CancelToken();
    }

    reloadHistory(): void {

        if (!!this.inProgress || !!this.selectedTab) {
            return;
        }

        // If dates are invalid, reverting them to previous valid values
        if (!!this._timeFrom && !DateTimeHelpers.isValidMoment(this._timeFrom)) {
            this._timeFrom = this._oldTimeFrom;
        }

        // Storing filter in query string only. Don't want it to stick to every instance in VsCode.
        this.writeFilterToQueryString();

        this._noMorePagesToLoad = false;
        this._history = [];
        this._historyTotalCount = 0;

        this.loadHistory();

        this._oldFilterValue = this._filterValue;
        this._oldTimeFrom = this._timeFrom;

        // Enabling back arrow.
        // This must be done here and not in the ctor, because onPopState events might be produced by external components and triggered immediately 
        // upon page load (when login state is not initialized yet), which would lead to errors. 
        this.registerOnPopStateHandler();
    }

    loadHistory(isAutoRefresh: boolean = false): void {

        if (!!this.inProgress || !!this.selectedTab || !!this._noMorePagesToLoad) {
            return;
        }

        const cancelToken = this._cancelToken;
        cancelToken.inProgress = true;

        var filter = toOdataFilterQuery(this._filteredColumn, this._filterOperator, this._filterValue);
        if (!!this._timeFrom) {
            
            filter = `timestamp ge '${this._timeFrom.toISOString()}'` + (!!filter ? ` and ${filter}` : '')
        }

        // In auto-refresh mode only refreshing the first page
        const skip = isAutoRefresh ? 0 : this._history.length;

        var uri = `/orchestrations('${this._orchestrationId}')/history?$top=${this._pageSize}&$skip=${skip}`;
        if (!!filter) {
            
            uri += '&$filter=' + filter;
        }

        this._backendClient.call('GET', uri).then(response => {

            if (cancelToken.isCancelled) {
                return;
            }

            this._historyTotalCount = response.totalCount;

            if (isAutoRefresh) {
                this._history = response.history;
            } else {
                this._history.push(...response.history);

                if (response.history.length < this._pageSize) {

                    // Stop the infinite scrolling
                    this._noMorePagesToLoad = true;
                }
            }
        }, err => {

            // Cancelling auto-refresh just in case
            this._autoRefresh = 0;

            if (!cancelToken.isCancelled) {
                this.showError('Failed to load history', err);
            }

        }).finally(() => {
            cancelToken.inProgress = false;
        });
    }

    gotoFunctionCode(functionName: string): void {

        if (this.backendClient.isVsCode) {
            
            this.backendClient.call('GotoFunctionCode', functionName).then(() => {}, err => {
                console.log(`Failed to goto function code: ${err.message}`);
            });
    
        } else {

            var func = this._functionMap[functionName];

            if (!!func && !!func.filePath) {
                window.open(func.filePath);
            }
        }
    }

    showFunctionsGraph(): void {

        this.backendClient.call('VisualizeFunctionsAsAGraph', '').then(() => {}, err => {
            console.log(`Failed to goto functions graph: ${err.message}`);
        });
    }

    applyTimeFrom() {
        if (DateTimeHelpers.isValidMoment(this._timeFrom) && this._oldTimeFrom !== this._timeFrom) {
            this.reloadHistory();
        }
    }

    applyFilterValue() {
        if (this._oldFilterValue !== this._filterValue) {
            this.reloadHistory();
        }
    }

    private loadCustomTab(): void {

        if (!!this.inProgress) {
            return;
        }

        const cancelToken = this._cancelToken;
        cancelToken.inProgress = true;

        this.selectedTab.load(this._details, cancelToken).then(() => {}, err => { 
                
            // Cancelling auto-refresh just in case
            this._autoRefresh = 0;

            if (!cancelToken.isCancelled) {
                this.showError('Failed to load tab', err);
            }

        }).finally(() => {
            cancelToken.inProgress = false;
        });
    }

    private setAutoRefresh(): void {

        if (!this._autoRefresh) {
            return;
        }

        if (!!this._autoRefreshToken) {
            clearTimeout(this._autoRefreshToken);
        }
        this._autoRefreshToken = setTimeout(() => this.loadDetails(), this._autoRefresh * 1000);
    }

    private loadAllHistory(orchestrationId: string): Promise<HistoryEvent[]> {

        const uri = `/orchestrations('${orchestrationId}')/history`;
        return this._backendClient.call('GET', uri).then(response => response.history);
    }

    private readFilterFromQueryString(): void {

        const queryString = new QueryString();

        const timeFromString = queryString.values['timeFrom'];
        this._timeFrom = !!timeFromString ? moment(timeFromString) : null;
        this._oldTimeFrom = this._timeFrom;

        this._filteredColumn = queryString.values['filteredColumn'] ?? '0';

        const filterOperatorString = queryString.values['filterOperator'];
        this._filterOperator = !!filterOperatorString ? FilterOperatorEnum[filterOperatorString] : FilterOperatorEnum.Equals;

        this._filterValue = queryString.values['filterValue'] ?? '';
        this._oldFilterValue = this._filterValue;
    }

    private writeFilterToQueryString() {
        
        const queryString = new QueryString();

        queryString.setValue('timeFrom', !!this._timeFrom ? this._timeFrom.toISOString() : null);
        queryString.setValue('filteredColumn', this._filteredColumn);
        queryString.setValue('filterOperator', FilterOperatorEnum[this._filterOperator]);
        queryString.setValue('filterValue', this._filterValue);

        queryString.apply(true);
    }

    private registerOnPopStateHandler(): void {

        if (!window.onpopstate) {
            
            window.onpopstate = (evt: PopStateEvent) => {

                this.readFilterFromQueryString();
                // This should be loadDetails(), not reloadHistory(). Because reloadHistory() pushes the history state, which shouldn't happen here.
                this.loadDetails();
            }
        }
    }

    @observable
    private _tabStates: ICustomTabState[] = [];

    @observable
    private _details: DurableOrchestrationStatus = new DurableOrchestrationStatus();
    @observable
    private _history: HistoryEvent[] = [];
    @observable
    private _tabIndex: number = 0;
    @observable
    private _inProgress: boolean = false;
    @observable
    private _cancelToken: CancelToken = new CancelToken();
    @observable
    private _raiseEventDialogOpen: boolean = false;
    @observable
    private _setCustomStatusDialogOpen: boolean = false;
    @observable
    private _restartDialogOpen: boolean = false;
    @observable
    private _suspendDialogOpen: boolean = false;
    @observable
    private _resumeDialogOpen: boolean = false;
    @observable
    private _autoRefresh: number = 0;
    @observable
    private _historyTotalCount: number = 0;
    @observable
    private _functionMap: FunctionsMap = {};

    @observable
    private _timeFrom: moment.Moment;
    @observable
    private _filterValue: string = '';
    @observable
    private _filterOperator: FilterOperatorEnum = FilterOperatorEnum.Equals;
    @observable
    private _filteredColumn: string = '0';

    private _oldTimeFrom: moment.Moment;
    private _oldFilterValue: string = '';
    private _autoRefreshToken: NodeJS.Timeout;
    private _noMorePagesToLoad: boolean = false;
    private readonly _pageSize = 200;
}