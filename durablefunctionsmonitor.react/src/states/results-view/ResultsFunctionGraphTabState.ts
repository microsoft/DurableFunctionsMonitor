// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { computed, observable } from 'mobx'
import mermaid from 'mermaid';

import { IBackendClient } from '../../services/IBackendClient';
import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { CancelToken } from '../../CancelToken';
import { IResultsTabState } from './ResultsListTabState';
import { FunctionGraphStateBase } from '../FunctionGraphStateBase';
import { buildFunctionDiagramCode } from 'az-func-as-a-graph.core/dist/buildFunctionDiagramCode';

export class MetricsItem {
    completed: number = 0;
    running: number = 0;
    failed: number = 0;
    other: number = 0;
    duration: number = 0;
}

export type MetricsMap = { [funcName: string]: MetricsItem };

// Resulting list of orchestrations represented on a Functions Graph
export class ResultsFunctionGraphTabState extends FunctionGraphStateBase implements IResultsTabState {

    @observable
    menuAnchorElement?: Element;

    @computed
    get metrics(): MetricsMap { return this._metrics; }

    @computed
    get diagramSvg(): string { return this._diagramSvg; }

    @computed
    get diagramCode(): string { return this._diagramCode; }

    @computed
    get renderFunctions(): boolean { return this._renderFunctions; };
    set renderFunctions(val: boolean) {
        this._renderFunctions = val;
        this.render();
    };

    @computed
    get renderProxies(): boolean { return this._renderProxies; };
    set renderProxies(val: boolean) {
        this._renderProxies = val;
        this.render();
    };

    readonly TotalMetricsName = 'DurableFunctionsMonitor-ResultsFunctionGraphTabState-TotalNumbers';

    constructor(backendClient: IBackendClient, private _startNewInstance: (funcName) => void) {
        super(backendClient);
    }

    showPopupMenu(anchorElement: Element, functionName: string) {

        this.menuAnchorElement = anchorElement;
        this._selectedFunctionName = functionName;
    }

    gotoOrchestrationCode() {
        this.menuAnchorElement = undefined;

        if (!!this._selectedFunctionName) {
            this.gotoFunctionCode(this._selectedFunctionName);
        }
    }

    startNewInstance() {
        this.menuAnchorElement = undefined;
        
        if (!!this._selectedFunctionName) {
            this._startNewInstance(this._selectedFunctionName);
        }
    }

    reset() {

        this._diagramCode = '';
        this._diagramSvg = '';
        this._traversalResult = null;
        this._metrics = {};
        this._numOfInstancesShown = 0;
    }

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean): Promise<void> {

        this.initMermaidWhenNeeded();

        this._numOfInstancesShown = 0;

        const clonedMetrics = !isAutoRefresh ? JSON.parse(JSON.stringify(this._metrics)) : {};

        return this._backendClient.call('GET', '/function-map').then(response => {
            
            this._traversalResult = response;
        
            return this.render().then(() => {

                return this.loadNextBatch(filterClause, 0, clonedMetrics, isAutoRefresh, cancelToken).then(metrics => {

                    // In autorefresh mode updating this observable property at the end, otherwise updating it on-the-fly
                    this._metrics = metrics;
                });
            })
        });
    }

    @observable
    private _metrics: MetricsMap = {};

    private _numOfInstancesShown: number = 0;
    private readonly _pageSize = 1000;

    private _selectedFunctionName: string;

    private loadNextBatch(filterClause: string, pageNumber: number, metrics: MetricsMap, isAutoRefresh: boolean, cancelToken: CancelToken): Promise<MetricsMap> {

        const uri = `/orchestrations?$top=${this._pageSize}&$skip=${this._numOfInstancesShown}${filterClause}`;

        return this._backendClient.call('GET', uri).then((instances: DurableOrchestrationStatus[]) => {

            if (cancelToken.isCancelled) {
                return Promise.resolve(metrics);
            }

            // updating metrics
            
            if (!metrics[this.TotalMetricsName]) {
                metrics[this.TotalMetricsName] = new MetricsItem();
            }

            for (var instance of instances) {

                const funcName = DurableOrchestrationStatus.getFunctionName(instance);

                if (!metrics[funcName]) {
                    metrics[funcName] = new MetricsItem();
                }

                switch (instance.runtimeStatus) {
                    case 'Completed':
                        metrics[funcName].completed++;
                        metrics[this.TotalMetricsName].completed++;
                        break;
                    case 'Running':
                    case 'Pending':
                    case 'ContinuedAsNew':
                        metrics[funcName].running++;
                        metrics[this.TotalMetricsName].running++;
                        break;
                    case 'Failed':
                        metrics[funcName].failed++;
                        metrics[this.TotalMetricsName].failed++;
                        break;
                    default:
                        metrics[funcName].other++;
                        metrics[this.TotalMetricsName].other++;
                        break;
                }
            }

            this._numOfInstancesShown += instances.length;

            // Making metrics look alive, when not in autorefresh mode
            if (!isAutoRefresh) {
                this._metrics = metrics;
            }

            if (instances.length === this._pageSize) {
                return this.loadNextBatch(filterClause, pageNumber + 1, metrics, isAutoRefresh, cancelToken);
            }

            return metrics;
        });
    }

    private render(): Promise<void> {

        this._diagramCode = '';
        this._diagramSvg = '';

        return new Promise<void>((resolve, reject) => {

            try {
                const diagramCode = buildFunctionDiagramCode(this._traversalResult.functions, this._traversalResult.proxies,
                    {
                        doNotRenderFunctions: !this._renderFunctions,
                        doNotRenderProxies: !this._renderProxies
                    });
    
                if (!diagramCode) {
                    resolve();
                    return;
                }
    
                this._diagramCode = `graph LR\n${diagramCode}`;
    
                mermaid.render('mermaidSvgId', this._diagramCode, (svg) => {
    
                    this._diagramSvg = this.applyIcons(svg);

                    resolve();
                });
    
            } catch (err) {
                reject(err);
            }
        });
    }
}