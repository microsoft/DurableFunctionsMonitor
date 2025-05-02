// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import mermaid from 'mermaid';
import moment from 'moment';

import { DurableOrchestrationStatus, HistoryEvent, EventWithHistory } from '../DurableOrchestrationStatus';
import { MermaidDiagramTabState } from './MermaidDiagramTabState';
import { CancelToken } from '../../CancelToken';
import { dfmContextInstance } from '../../DfmContext';

type LineTextAndMetadata = { nextLine: string, functionName?: string, instanceId?: string, parentInstanceId?: string, duration?: number, widthPercentage?: number };

const MaxEventsBeforeStartAggregating = 500;
const TimestampIntervalInMsForAggregating = 500;
const MaxAggregatedEvents = 100;
const EventTypesToBeAggregated = ['TaskCompleted', 'TaskFailed', 'TimerFired'];

// State of Gantt Diagram tab on OrchestrationDetails view
export class GanttDiagramTabState extends MermaidDiagramTabState {

    readonly name: string = "Gantt Chart";

    protected buildDiagram(details: DurableOrchestrationStatus, history: HistoryEvent[], cancelToken: CancelToken): Promise<void> {

        return this.loadSubOrchestrations(history as EventWithHistory[])
            .then(history => { 

                return this.renderOrchestration(details.instanceId, details.name, history, true);
            })
            .then(lines => {

                if (cancelToken.isCancelled) {

                    return;
                }

                const linesWithMetadata = lines.filter(l => !!l.functionName);

                this._diagramCode = 'gantt \n' +
                    `title ${details.name}(${details.instanceId}) \n` +
                    'dateFormat YYYY-MM-DDTHH:mm:ss.SSS \n' +
                    lines.map(item => item.nextLine).join('');

                return this.renderDiagram(linesWithMetadata);
            }
        );
    }

    // Promisifies diagram rendering
    private renderDiagram(linesWithMetadata: LineTextAndMetadata[]): Promise<void> {

        // Very much unknown, why this line is needed. Without it sometimes the diagrams fail to re-render
        this._diagramSvg = '';

        return new Promise<void>((resolve, reject) => {

            try {

                mermaid.render('mermaidSvgId', this._diagramCode).then(result => {

                    let svg = result.svg;

                    svg = this.injectFunctionNameAttributes(svg, linesWithMetadata);

                    this._diagramSvg = svg;
                    resolve();

                }, err => {
                    reject(err);
                });
                
            } catch (err) {
                reject(err);
            }
        });
    }

    // Adds data-function-name attributes to diagram lines, so that Function names can be further used by rendering
    private injectFunctionNameAttributes(svg: string, linesWithMetadata: LineTextAndMetadata[]): string {
        
        return svg.replace(new RegExp(`<(rect|text) id="task([0-9]+)(-text)?"`, 'gi'), (match, tagName, taskIndex) => {

            const oneBasedLineIndex = parseInt(taskIndex);

            if (oneBasedLineIndex <= 0 || oneBasedLineIndex > linesWithMetadata.length) {
                return match;
            }

            const lineMetadata = linesWithMetadata[oneBasedLineIndex - 1];
            if (!lineMetadata.functionName) {
                return match;
            }

            return match + ` data-function-name="${lineMetadata.functionName}"`;
        });
    }

    private renderOrchestration(orchestrationId: string, orchestrationName: string, historyEvents: EventWithHistory[], isParentOrchestration: boolean): LineTextAndMetadata[] {

        const results: LineTextAndMetadata[] = [];

        const startedEvent = historyEvents.find(event => event.eventType === 'ExecutionStarted');
        const completedEvent = historyEvents.find(event => event.eventType === 'ExecutionCompleted');

        var needToAddAxisFormat = isParentOrchestration;
        var nextLine: string;
        var orchDuration = 0;

        if (!!startedEvent && !!completedEvent) {

            if (needToAddAxisFormat) {

                // Axis format should always appear on top, prior to all other lines - this is why it looks a bit complicated.
                const longerThanADay = completedEvent.durationInMs > 86400000;
                nextLine = longerThanADay ? 'axisFormat %Y-%m-%d %H:%M \n' : 'axisFormat %H:%M:%S \n';
                results.push({ nextLine });
                needToAddAxisFormat = false;
            }
            
            nextLine = isParentOrchestration ? '' : `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;

            var lineName = this.formatDuration(completedEvent.durationInMs);
            if (!lineName) {
                lineName = this.formatLineName(orchestrationName, 0);
            }

            nextLine += `${lineName}: ${isParentOrchestration ? '' : 'active,'} ${this.formatDateTime(startedEvent.timestamp)}, ${completedEvent.durationInMs}ms \n`;
            results.push({ nextLine, functionName: orchestrationName, instanceId: orchestrationId });
            
            orchDuration = completedEvent.durationInMs;
        }

        if (needToAddAxisFormat) {

            nextLine = 'axisFormat %H:%M:%S \n';
            results.push({ nextLine });
        }

        for (let i = 0; i < historyEvents.length; i++) {

            let event = historyEvents[i];
            let numOfAggregatedEvents = 0;

            // If too many events, then trying to aggregate
            if (historyEvents.length > MaxEventsBeforeStartAggregating && EventTypesToBeAggregated.includes(event.eventType)) {

                const scheduledTimeInMs = Date.parse(event.scheduledTime);
                let maxDurationInMs = event.durationInMs;

                let j = i + 1;
                while (j < historyEvents.length) {

                    const nextScheduledTimeInMs = Date.parse(historyEvents[j].scheduledTime);

                    if (
                        (MaxAggregatedEvents <= j - i)
                        ||
                        (historyEvents[j].eventType !== event.eventType)
                        ||
                        (historyEvents[j].name !== event.name)
                        ||
                        (TimestampIntervalInMsForAggregating < nextScheduledTimeInMs - scheduledTimeInMs)
                    ) {
                        break;
                    }

                    const nextDurationInMs = (nextScheduledTimeInMs - scheduledTimeInMs) + historyEvents[j].durationInMs;
                    if (nextDurationInMs > maxDurationInMs) {
                        maxDurationInMs = nextDurationInMs;
                    }

                    j++;
                }

                if (j > i + 1) {

                    numOfAggregatedEvents = j - i;
                    event.durationInMs = maxDurationInMs;
                    i = j - 1;
                }
            }

            var eventTimestamp = event.scheduledTime;

            // Sometimes activity timestamp might appear to be earlier than orchestration start (due to machine time difference, I assume),
            // and that breaks the diagram
            if (!!startedEvent && (Date.parse(eventTimestamp) < Date.parse(startedEvent.timestamp))) {
                eventTimestamp = startedEvent.timestamp;
            }
        
            switch (event.eventType) {
                case 'SubOrchestrationInstanceCompleted':
                case 'SubOrchestrationInstanceFailed':

                    if (!!event.subOrchestrationId && !!event.history) {

                        const subOrchestrationId = event.subOrchestrationId;
                        const subOrchestrationName = event.name;

                        results.push(...this.renderOrchestration(subOrchestrationId, subOrchestrationName, event.history, false));
                        
                        nextLine = `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;
                        results.push({ nextLine });
                    }

                    break;
                case 'TaskCompleted':

                    nextLine = `${this.formatLineName(event.name, numOfAggregatedEvents)} ${this.formatDuration(event.durationInMs)}: done, ${this.formatDateTime(eventTimestamp)}, ${event.durationInMs}ms \n`;
                    results.push({
                        nextLine,
                        functionName: event.name,
                        parentInstanceId: orchestrationId,
                        duration: event.durationInMs,
                        widthPercentage: orchDuration ? event.durationInMs / orchDuration : 0
                    });

                    break;
                case 'TaskFailed':

                    nextLine = `${this.formatLineName(event.name, numOfAggregatedEvents)} ${this.formatDuration(event.durationInMs)}: crit, ${this.formatDateTime(eventTimestamp)}, ${event.durationInMs}ms \n`;
                    results.push({
                        nextLine,
                        functionName: event.name,
                        parentInstanceId: orchestrationId,
                        duration: event.durationInMs,
                        widthPercentage: orchDuration ? event.durationInMs / orchDuration : 0
                    });

                    break;
                case 'TimerFired':

                    nextLine = `[TimerFired]: milestone, ${this.formatDateTime(event.timestamp)}, 0s \n`;
                    results.push({
                        nextLine,
                        functionName: orchestrationName,
                        parentInstanceId: orchestrationId
                    });

                    break;
                }
        }

        return results;
    }

    // Loads the full hierarchy of orchestrations/suborchestrations
    private loadSubOrchestrations(history: EventWithHistory[]): Promise<EventWithHistory[]> {

        const promises: Promise<void>[] = [];

        for (const event of history) {
            
            switch (event.eventType) {
                case "SubOrchestrationInstanceCompleted":
                case "SubOrchestrationInstanceFailed":

                    promises.push(

                        this._loadHistory(event.subOrchestrationId)
                            .then(subHistory => this.loadSubOrchestrations(subHistory as any))
                            .then(subHistory => {
    
                                event.history = subHistory;
    
                            })
                            .catch(err => {
    
                                console.log(`Failed to load ${event.subOrchestrationId}. ${err.message}`);
                            })
                    );
                            
                break;
            }            
        }

        return Promise.all(promises).then(() => { return history as EventWithHistory[]; })
    }

    private formatDateTime(utcDateTimeString: string): string {

        if (!dfmContextInstance.showTimeAsLocal) {
            return utcDateTimeString.substr(0, 23);
        }

        return moment(utcDateTimeString).format('YYYY-MM-DDTHH:mm:ss.SSS')
    }

    private formatLineName(name: string, numOfTimes: number): string {

        name = name.replace(/:/g, '-');

        if (numOfTimes > 0) {
            name += ` <<${numOfTimes} events>>`
        }

        return name;
    }
}