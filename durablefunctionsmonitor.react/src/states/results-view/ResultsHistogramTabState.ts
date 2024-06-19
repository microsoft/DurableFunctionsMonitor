// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx'
import moment from 'moment';

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { IBackendClient } from '../../services/IBackendClient';
import { CancelToken } from '../../CancelToken';
import { IResultsTabState } from './ResultsListTabState';
import { TimeRangeEnum } from './OrchestrationsState';

type HistogramColumn = { x0: number, x: number, y: number };
type TimeInterval = { timeFrom: moment.Moment, timeTill: moment.Moment, timeRange: TimeRangeEnum };

// Resulting list of orchestrations represented as a Gantt chart
export class ResultsHistogramTabState implements IResultsTabState {

    @computed
    get zoomedIn() { return this._zoomedIn; }

    @computed
    get histograms() { return this._histograms; }

    @computed
    get numOfInstancesShown() { return this._numOfInstancesShown; }

    get counts() { return this._counts; }

    get timeRangeInMilliseconds(): number {
        return this._timeRangeInMilliseconds;
    }

    constructor (
        private _backendClient: IBackendClient,
        private _filterState: TimeInterval & { reloadOrchestrations: () => void, cancel: () => void }) {
    }

    reset() {

        this._instances = [];
        this._numOfInstancesShown = 0;
    }

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean): Promise<void> {

        if (!this._applyingZoom && !this._zoomedIn) {

            this._originalTimeInterval = {
                timeFrom: this._filterState.timeFrom,
                timeTill: this._filterState.timeTill,
                timeRange: this._filterState.timeRange
            };
        }

        this._instances = [];
        this._numOfInstancesShown = 0;
        this._histograms = {};
        this._counts = {};

        const startTime = this._filterState.timeFrom.valueOf();
        let bucketLength = Math.ceil((this._filterState.timeTill.valueOf() - startTime) / this._numOfIntervals);
        if (bucketLength <= 0) {
            bucketLength = 1;
        }

        // Need to remember this value, for later time axis rendering
        this._timeRangeInMilliseconds = this._filterState.timeTill.valueOf() - this._filterState.timeFrom.valueOf();

        const keepFetching = (pageNumber: number) => {

            const uri = `/orchestrations?$top=${this._pageSize}&$skip=${this._numOfInstancesShown}${filterClause}`;
    
            return this._backendClient.call('GET', uri).then((instances: DurableOrchestrationStatus[]) => {
    
                if (cancelToken.isCancelled) {
                    return Promise.resolve();
                }
    
                for (const instance of instances) {
    
                    const instanceTypeName = DurableOrchestrationStatus.getFunctionName(instance);
    
                    if (!this._histograms[instanceTypeName]) {
                        
                        const emptyHistogram = [];
                        for (var i = 0; i < this._numOfIntervals; i++) {
                            emptyHistogram[i] = { x0: startTime + i * bucketLength, x: startTime + (i + 1) * bucketLength, y: 0 };
                        }
                        this._histograms[instanceTypeName] = emptyHistogram;
                    }
    
                    const instanceStartPos = Math.floor((new Date(instance.createdTime).getTime() - startTime) / bucketLength);
                    if (instanceStartPos < 0 || instanceStartPos >= this._numOfIntervals) {
                        continue;
                    }
    
                    this._histograms[instanceTypeName][instanceStartPos].y += 1;
    
                    if (!this._counts[instanceTypeName]) {
                        this._counts[instanceTypeName] = 1;
                    } else {
                        this._counts[instanceTypeName] += 1;
                    }
                }
    
                this._instances.push(...instances);
                this._numOfInstancesShown += instances.length;
    
                if (instances.length === this._pageSize) {
                    
                    return keepFetching(pageNumber + 1);
                }
            });
        };

        return keepFetching(0);
    }

    applyZoom(left: Date, right: Date) {

        this._numOfInstancesShown = 0;

        this._filterState.cancel();
        
        // rounding to next second
        const from = Math.floor(left.getTime() / 1000) * 1000;
        const till = Math.ceil(right.getTime() / 1000) * 1000;

        this._filterState.timeFrom = moment(from);
        this._filterState.timeTill = moment(till);

        this._applyingZoom = true;
        try {
            this._filterState.reloadOrchestrations();
        } finally {
            this._applyingZoom = false;
        }

        this._zoomedIn = true;
    }

    resetZoom() {

        if (!this._zoomedIn || !this._originalTimeInterval) {
            return;
        }

        this._zoomedIn = false;

        this._filterState.cancel();

        this._filterState.timeFrom = this._originalTimeInterval.timeFrom;
        this._filterState.timeTill = this._originalTimeInterval.timeTill;
        this._filterState.timeRange = this._originalTimeInterval.timeRange;
    }

    getShownInstances(): { id: string, name: string }[]{

        return this._instances.map(i => { return { id: i.instanceId, name: i.name }; });
    }

    @observable
    private _histograms: { [typeName: string]: HistogramColumn[]; } = {};

    private _counts: { [typeName: string]: number; } = {};

    @observable
    private _numOfInstancesShown: number = 0;

    @observable
    private _zoomedIn = false;

    private _instances: DurableOrchestrationStatus[] = [];

    private _originalTimeInterval: TimeInterval = null;
    private _applyingZoom = false;
    private _timeRangeInMilliseconds = 0;

    private readonly _numOfIntervals = 200;
    private readonly _pageSize = 1000;
}