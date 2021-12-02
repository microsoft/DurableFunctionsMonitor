// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { computed } from 'mobx'
import mermaid from 'mermaid';
import moment from 'moment';

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { IBackendClient } from '../../services/IBackendClient';
import { CancelToken } from '../../CancelToken';
import { IResultsTabState } from './ResultsListTabState';
import { MermaidDiagramStateBase } from '../MermaidDiagramStateBase';
import { dfmContextInstance } from '../../DfmContext';

// Resulting list of orchestrations represented as a Gantt chart
export class ResultsGanttDiagramTabState extends MermaidDiagramStateBase implements IResultsTabState {

    @computed
    get rawHtml(): string { return this._diagramSvg; }

    @computed
    get diagramCode(): string { return this._diagramCode; }

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    reset() {

        this._diagramCode = '';
        this._diagramSvg = '';
        this._instances = [];
    }

    load(filterClause: string, cancelToken: CancelToken, isAutoRefresh: boolean): Promise<void> {

        this.initMermaidWhenNeeded();

        return new Promise<void>((resolve, reject) => {

            const uri = `/orchestrations?$top=500&$orderby=createdTime asc${filterClause}`;

            this._backendClient.call('GET', uri).then((instances: DurableOrchestrationStatus[]) => {

                this._instances = instances;

                if (cancelToken.isCancelled) {
                    resolve();
                    return;
                }

                this._diagramCode = 'gantt \n' +
                    `title Gantt Chart (${instances.length} instances shown) \n` +
                    'dateFormat YYYY-MM-DDTHH:mm:ss \n' +
                    this.renderDiagram(instances);

                // Very much unknown, why this line is needed. Without it sometimes the diagrams fail to re-render
                this._diagramSvg = '';

                try {

                    mermaid.render('mermaidSvgId', this._diagramCode, (svg) => {
                        this._diagramSvg = svg;
                        resolve();
                    });

                } catch (err) {
                    reject(err);
                }

            }, reject);
        });
    }

    // Opens the selected orchestrationId in a new tab
    goto(oneBasedInstanceIndex: number) {

        if (!!oneBasedInstanceIndex && oneBasedInstanceIndex <= this._instances.length) {

            this._backendClient.showDetails(this._instances[oneBasedInstanceIndex - 1].instanceId);
        }
    }

    private _instances: DurableOrchestrationStatus[] = [];

    private renderDiagram(instances: DurableOrchestrationStatus[]): string {

        var result: string = '';

        var prevSectionName = '';
        var sectionNr = 0;
        for (const instance of instances) {

            var nextLine = '';

            // Grouping instances by their type
            const sectionName = DurableOrchestrationStatus.getFunctionName(instance);
            if (sectionName !== prevSectionName) {
                
                nextLine = `section ${++sectionNr}. ${this.escapeTitle(sectionName)} \n`;
                prevSectionName = sectionName;
            }

            const instanceId = instance.entityType === 'DurableEntity' ? instance.entityId.key : instance.instanceId;
            const durationInMs = new Date(instance.lastUpdatedTime).getTime() - new Date(instance.createdTime).getTime();

            nextLine += `${this.escapeTitle(instanceId)} ${this.formatDuration(durationInMs)}: active, ${this.formatDateTime(instance.createdTime)}, ${this.formatDurationInSeconds(durationInMs)} \n`;
            
            result += nextLine;
        }

        return result;
    }

    private formatDateTime(utcDateTimeString: string): string {

        if (!dfmContextInstance.showTimeAsLocal) {
            return utcDateTimeString.substr(0, 19);
        }

        return moment(utcDateTimeString).format('YYYY-MM-DDTHH:mm:ss')
    }
}