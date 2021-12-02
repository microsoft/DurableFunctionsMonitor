// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx';
import mermaid from 'mermaid';

import { IBackendClient } from '../../services/IBackendClient';
import { DurableOrchestrationStatus, HistoryEvent, RuntimeStatus } from '../DurableOrchestrationStatus';
import { ICustomTabState, CustomTabTypeEnum } from './ICustomTabState';
import { FunctionGraphStateBase, TraversalResult } from '../FunctionGraphStateBase';
import { buildFunctionDiagramCode } from '../az-func-as-a-graph/buildFunctionDiagramCode';
import { CancelToken } from '../../CancelToken';
import { MetricsMap, MetricsItem } from '../results-view/ResultsFunctionGraphTabState';

// State of Functions Graph tab on OrchestrationDetails view
export class FunctionGraphTabState extends FunctionGraphStateBase implements ICustomTabState {

    readonly name = "Functions Graph";
    readonly tabType = CustomTabTypeEnum.FunctionGraph;

    @computed
    get description(): string { return this._diagramCode; };

    @computed
    get rawHtml(): string { return this._diagramSvg; };

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

    @computed
    get metrics(): MetricsMap { return this._metrics; }

    constructor(backendClient: IBackendClient, traversalResult: TraversalResult, private _loadHistory: (orchestrationId: string) => Promise<HistoryEvent[]>) {
        super(backendClient);
        this._traversalResult = traversalResult;
    }

    load(details: DurableOrchestrationStatus, cancelToken: CancelToken): Promise<void> {

        // Only doing this on demand, just in case
        this.initMermaidWhenNeeded();

        const metrics: MetricsMap = {};

        return this.render().then(() => {

            return this._loadHistory(details.instanceId).then(history => {

                if (cancelToken.isCancelled) {
                    return;
                }

                return this.updateMetricsForInstance(metrics, DurableOrchestrationStatus.getFunctionName(details),
                        details.runtimeStatus, new Date(details.lastUpdatedTime).getTime() - new Date(details.createdTime).getTime(),
                        history, cancelToken)
                    .then(() => {

                        this._metrics = metrics;
                    });
            });
        })
    }

    @observable
    private _metrics: MetricsMap = {};

    private updateMetricsForInstance(metrics: MetricsMap,
        funcName: string,
        runtimeStatus: RuntimeStatus,
        durationInMs: number,
        history: HistoryEvent[],
        cancelToken: CancelToken): Promise<void> {
        
        if (!metrics[funcName]) {
            metrics[funcName] = new MetricsItem();
        }

        switch (runtimeStatus) {
            case 'Completed':
                metrics[funcName].completed++;
                break;
            case 'Running':
            case 'Pending':
            case 'ContinuedAsNew':
                metrics[funcName].running++;
                break;
            case 'Failed':
                metrics[funcName].failed++;
                break;
            default:
                metrics[funcName].other++;
                break;
        }

        if (metrics[funcName].duration < durationInMs) {
            metrics[funcName].duration = durationInMs;
        }

        const promises: Promise<void>[] = [];

        for (var event of history) {

            const subFuncName = event.Name;

            switch (event.EventType) {
                case 'SubOrchestrationInstanceCreated':

                    if (!!event.SubOrchestrationId) {

                        promises.push(this._loadHistory(event.SubOrchestrationId).then(subHistory => {

                            if (!cancelToken.isCancelled) {
                                return this.updateMetricsForInstance(metrics, subFuncName, "Running", 0, subHistory, cancelToken);
                            }
                        }));
                    }

                    break;
                case 'SubOrchestrationInstanceCompleted':

                    if (!!event.SubOrchestrationId) {

                        const durationInMs = new Date(event.Timestamp).getTime() - new Date(event.ScheduledTime).getTime();

                        promises.push(this._loadHistory(event.SubOrchestrationId).then(subHistory => {

                            if (!cancelToken.isCancelled) {
                                return this.updateMetricsForInstance(metrics, subFuncName, "Completed", durationInMs, subHistory, cancelToken);
                            }
                        }));
                    }
                    
                    break;
                case 'SubOrchestrationInstanceFailed':

                    if (!!event.SubOrchestrationId) {

                        const durationInMs = new Date(event.Timestamp).getTime() - new Date(event.ScheduledTime).getTime();

                        promises.push(this._loadHistory(event.SubOrchestrationId).then(subHistory => {

                            if (!cancelToken.isCancelled) {
                                return this.updateMetricsForInstance(metrics, subFuncName, "Failed", durationInMs, subHistory, cancelToken);
                            }
                        }));
                    }
                
                    break;
                case 'TaskCompleted':

                    if (!metrics[subFuncName]) {
                        metrics[subFuncName] = new MetricsItem();
                    }

                    metrics[subFuncName].completed++;

                    if (metrics[subFuncName].duration < event.DurationInMs) {
                        metrics[subFuncName].duration = event.DurationInMs;
                    }
                    
                    break;
                case 'TaskFailed':

                    if (!metrics[subFuncName]) {
                        metrics[subFuncName] = new MetricsItem();
                    }

                    metrics[subFuncName].failed++;

                    if (metrics[subFuncName].duration < event.DurationInMs) {
                        metrics[subFuncName].duration = event.DurationInMs;
                    }
                    
                    break;
                case 'TaskScheduled':

                    if (!metrics[subFuncName]) {
                        metrics[subFuncName] = new MetricsItem();
                    }

                    metrics[subFuncName].running++;
                    
                    break;
            }                   
        }

        return Promise.all(promises) as any;
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