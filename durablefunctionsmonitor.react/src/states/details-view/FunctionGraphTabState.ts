// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx';
import mermaid from 'mermaid';

import { IBackendClient } from '../../services/IBackendClient';
import { DurableOrchestrationStatus, HistoryEvent, EventWithHistory, RuntimeStatus } from '../DurableOrchestrationStatus';
import { ICustomTabState, CustomTabTypeEnum } from './ICustomTabState';
import { FunctionGraphStateBase, TraversalResult } from '../FunctionGraphStateBase';
import { buildFunctionDiagramCode } from 'az-func-as-a-graph.core/dist/buildFunctionDiagramCode';
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

        return this._loadHistory(details.instanceId)
            .then(history => this.loadSubOrchestrations(details.name, history as EventWithHistory[]))
            // render() should happen after loadSubOrchestrations(), because loadSubOrchestrations() updates function map
            .then(history => this.render().then(() => history))
            .then(history => {

                if (cancelToken.isCancelled) {
                    return;
                }

                this.updateMetricsForInstance(metrics, DurableOrchestrationStatus.getFunctionName(details),
                    details.runtimeStatus, new Date(details.lastUpdatedTime).getTime() - new Date(details.createdTime).getTime(),
                    history, cancelToken);
                
                this._metrics = metrics;
            });
    }

    @observable
    private _metrics: MetricsMap = {};

    private updateMetricsForInstance(metrics: MetricsMap,
        funcName: string,
        runtimeStatus: RuntimeStatus,
        durationInMs: number,
        history: EventWithHistory[],
        cancelToken: CancelToken) {
        
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

        for (var event of history) {

            const subFuncName = event.name;

            switch (event.eventType) {
                case 'SubOrchestrationInstanceCreated':

                    if (!!event.subOrchestrationId && !!event.history) {

                        this.updateMetricsForInstance(metrics, subFuncName, "Running", 0, event.history, cancelToken);
                    }

                    break;
                case 'SubOrchestrationInstanceCompleted':

                    if (!!event.subOrchestrationId && !!event.history) {

                        const durationInMs = new Date(event.timestamp).getTime() - new Date(event.scheduledTime).getTime();

                        this.updateMetricsForInstance(metrics, subFuncName, "Completed", durationInMs, event.history, cancelToken);
                    }
                    
                    break;
                case 'SubOrchestrationInstanceFailed':

                    if (!!event.subOrchestrationId && !!event.history) {

                        const durationInMs = new Date(event.timestamp).getTime() - new Date(event.scheduledTime).getTime();

                        this.updateMetricsForInstance(metrics, subFuncName, "Failed", durationInMs, event.history, cancelToken);
                    }
                
                    break;
                case 'TaskCompleted':

                    if (!metrics[subFuncName]) {
                        metrics[subFuncName] = new MetricsItem();
                    }

                    metrics[subFuncName].completed++;

                    if (metrics[subFuncName].duration < event.durationInMs) {
                        metrics[subFuncName].duration = event.durationInMs;
                    }
                    
                    break;
                case 'TaskFailed':

                    if (!metrics[subFuncName]) {
                        metrics[subFuncName] = new MetricsItem();
                    }

                    metrics[subFuncName].failed++;

                    if (metrics[subFuncName].duration < event.durationInMs) {
                        metrics[subFuncName].duration = event.durationInMs;
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
    }
    
    private render(): Promise<void> {

        this._diagramCode = '';
        this._diagramSvg = '';

        return new Promise<void>((resolve, reject) => {

            try {
                let diagramCode = buildFunctionDiagramCode(this._traversalResult.functions, this._traversalResult.proxies,
                    {
                        doNotRenderFunctions: !this._renderFunctions,
                        doNotRenderProxies: !this._renderProxies
                    });
    
                if (!diagramCode) {
                    resolve();
                    return;
                }
    
                diagramCode = `graph LR\n${diagramCode}`;
                this._diagramCode = diagramCode;
        
                diagramCode = this.addSpaceForIcons(diagramCode);

                mermaid.render('mermaidSvgId', diagramCode).then(result => {
    
                    this._diagramSvg = this.applyIcons(result.svg);
                    resolve();

                }, err => {
                    reject(err);
                });
    
            } catch (err) {
                reject(err);
            }
        });
    }

    // Loads the full hierarchy of orchestrations/suborchestrations
    private loadSubOrchestrations(orchName: string, history: EventWithHistory[]): Promise<EventWithHistory[]> {

        const promises: Promise<void>[] = [];

        for (const event of history) {

            switch (event.eventType) {
                case "SubOrchestrationInstanceCompleted":
                case "SubOrchestrationInstanceFailed":

                    promises.push(

                        this._loadHistory(event.subOrchestrationId)
                            .then(subHistory => this.loadSubOrchestrations(event.name, subHistory as any))
                            .then(subHistory => {
    
                                event.history = subHistory;
    
                            })
                            .catch(err => {
    
                                console.log(`Failed to load ${event.subOrchestrationId}. ${err.message}`);
                            })
                    );
                        
                    break;
                
                case 'TaskCompleted':
                case 'TaskFailed':
                case 'TaskScheduled':

                    // Also fixing FunctionMap
                    
                    if (!!this._traversalResult && !!this._traversalResult.functions) {
                        
                        const func = this._traversalResult.functions[event.name];
                        if (!!func) {

                            if (!func.isCalledBy) {
                                func.isCalledBy = [];
                            }

                            if (!func.isCalledBy.includes(orchName)) {
                                
                                func.isCalledBy.push(orchName);
                            }
                        }
                    }
                    
                    break;
            }           
        }

        return Promise.all(promises).then(() => history);
    }
}