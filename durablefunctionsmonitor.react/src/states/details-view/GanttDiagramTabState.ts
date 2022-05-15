// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import mermaid from 'mermaid';
import moment from 'moment';

import { DurableOrchestrationStatus, HistoryEvent } from '../DurableOrchestrationStatus';
import { MermaidDiagramTabState } from './MermaidDiagramTabState';
import { CancelToken } from '../../CancelToken';
import { dfmContextInstance } from '../../DfmContext';

type LineTextAndMetadata = { nextLine: string, functionName?: string, instanceId?: string, parentInstanceId?: string, duration?: number, widthPercentage?: number };

const MaxEventsBeforeStartAggregating = 500;
const TimestampIntervalInMsForAggregating = 500;
const MaxAggregatedEvents = 100;
const EventTypesToBeAggregated = ['TaskCompleted', 'TaskFailed', 'TimerFired'];
const SubOrchestrationEventTypes = ['SubOrchestrationInstanceCompleted', 'SubOrchestrationInstanceFailed'];

class EventWithHistory extends HistoryEvent {
    history: EventWithHistory[];
}

// State of Gantt Diagram tab on OrchestrationDetails view
export class GanttDiagramTabState extends MermaidDiagramTabState {

    readonly name: string = "Gantt Chart";

    protected buildDiagram(details: DurableOrchestrationStatus, history: HistoryEvent[], cancelToken: CancelToken): Promise<void> {

        return this.loadSubOrchestrations(history as any)
            .then(history => { 

                return this.renderOrchestration(details.instanceId, details.name, history as any, true);
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

                mermaid.render('mermaidSvgId', this._diagramCode, (svg) => {

                    svg = this.injectFunctionNameAttributes(svg, linesWithMetadata);
                    svg = this.adjustIntervalsSmallerThanOneSecond(svg, linesWithMetadata);

                    this._diagramSvg = svg;

                    resolve();
                });
                
            } catch (err) {
                reject(err);
            }
        });
    }

    // Loads the full hierarchy of orchestrations/suborchestrations
    private loadSubOrchestrations(history: EventWithHistory[]): Promise<EventWithHistory[]> {

        const promises: Promise<void>[] = [];

        for (const event of history) {
            
            if (SubOrchestrationEventTypes.includes(event.EventType)) {

                promises.push(

                    this._loadHistory(event.SubOrchestrationId)
                        .then(subHistory => this.loadSubOrchestrations(subHistory as any))
                        .then(subHistory => {

                            event.history = subHistory;

                        })
                );
            }
        }

        return Promise.all(promises).then(() => { return history as EventWithHistory[]; })
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

    // Workaround for mermaid being unable to render intervals shorter than 1 second
    private adjustIntervalsSmallerThanOneSecond(svg: string, linesWithMetadata: LineTextAndMetadata[]): string {

        return svg.replace(new RegExp(`<rect id="task([0-9]+)" [^>]+ width="([0-9]+)"`, 'gi'), (match, taskIndex, activityWidth) => {

            const oneBasedLineIndex = parseInt(taskIndex);

            if (oneBasedLineIndex <= 0 || oneBasedLineIndex > linesWithMetadata.length) {
                return match;
            }

            const activityMetadata = linesWithMetadata[oneBasedLineIndex - 1];
            if (!activityMetadata.parentInstanceId || !activityMetadata.widthPercentage || (activityMetadata.duration > 10000)) {
                return match;
            }

            // now we need to figure out the width (in pixels) of parent orchestration line
            const orchIndex = linesWithMetadata.findIndex(l => l.instanceId === activityMetadata.parentInstanceId);
            if (orchIndex < 0) {
                return match;
            }

            const orchMatch = new RegExp(`<rect id="task${orchIndex + 1}" [^>]+ width="([0-9]+)"`, 'i').exec(svg);
            if (!orchMatch) {
                return match;
            }

            const orchWidth = parseInt(orchMatch[1]);
            const newActivityWidth = activityMetadata.widthPercentage > 1 ? orchWidth : Math.ceil(orchWidth * activityMetadata.widthPercentage);

            return match.replace(`width="${activityWidth}"`, `width="${newActivityWidth.toFixed(0)}"`)
        });
    }

    private renderOrchestration(orchestrationId: string, orchestrationName: string, historyEvents: EventWithHistory[], isParentOrchestration: boolean): LineTextAndMetadata[] {

        const results: LineTextAndMetadata[] = [];

        if (!historyEvents) {
            return results;
        }

        const startedEvent = historyEvents.find(event => event.EventType === 'ExecutionStarted');
        const completedEvent = historyEvents.find(event => event.EventType === 'ExecutionCompleted');

        var needToAddAxisFormat = isParentOrchestration;
        var nextLine: string;
        var orchDuration = 0;

        if (!!startedEvent && !!completedEvent) {

            if (needToAddAxisFormat) {

                // Axis format should always appear on top, prior to all other lines - this is why it looks a bit complicated.
                const longerThanADay = completedEvent.DurationInMs > 86400000;
                nextLine = longerThanADay ? 'axisFormat %Y-%m-%d %H:%M \n' : 'axisFormat %H:%M:%S \n';
                results.push({ nextLine });
                needToAddAxisFormat = false;
            }
            
            nextLine = isParentOrchestration ? '' : `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;

            var lineName = this.formatDuration(completedEvent.DurationInMs);
            if (!lineName) {
                lineName = this.formatLineName(orchestrationName, 0);
            }

            nextLine += `${lineName}: ${isParentOrchestration ? '' : 'active,'} ${this.formatDateTime(startedEvent.Timestamp)}, ${this.formatDurationInSeconds(completedEvent.DurationInMs)} \n`;
            results.push({ nextLine, functionName: orchestrationName, instanceId: orchestrationId });
            
            orchDuration = completedEvent.DurationInMs;
        }

        if (needToAddAxisFormat) {

            nextLine = 'axisFormat %H:%M:%S \n';
            results.push({ nextLine });
        }

        for (let i = 0; i < historyEvents.length; i++) {

            let event = historyEvents[i];
            let numOfAggregatedEvents = 0;

            // If too many events, then trying to aggregate
            if (historyEvents.length > MaxEventsBeforeStartAggregating && EventTypesToBeAggregated.includes(event.EventType)) {

                const scheduledTimeInMs = Date.parse(event.ScheduledTime);
                let maxDurationInMs = event.DurationInMs;

                let j = i + 1;
                while (j < historyEvents.length) {

                    const nextScheduledTimeInMs = Date.parse(historyEvents[j].ScheduledTime);

                    if (
                        (MaxAggregatedEvents <= j - i)
                        ||
                        (historyEvents[j].EventType !== event.EventType)
                        ||
                        (historyEvents[j].Name !== event.Name)
                        ||
                        (TimestampIntervalInMsForAggregating < nextScheduledTimeInMs - scheduledTimeInMs)
                    ) {
                        break;
                    }

                    const nextDurationInMs = (nextScheduledTimeInMs - scheduledTimeInMs) + historyEvents[j].DurationInMs;
                    if (nextDurationInMs > maxDurationInMs) {
                        maxDurationInMs = nextDurationInMs;
                    }

                    j++;
                }

                if (j > i + 1) {

                    numOfAggregatedEvents = j - i;
                    event.DurationInMs = maxDurationInMs;
                    i = j - 1;
                }
            }

            var eventTimestamp = event.ScheduledTime;

            // Sometimes activity timestamp might appear to be earlier than orchestration start (due to machine time difference, I assume),
            // and that breaks the diagram
            if (!!startedEvent && (Date.parse(eventTimestamp) < Date.parse(startedEvent.Timestamp))) {
                eventTimestamp = startedEvent.Timestamp;
            }
        
            switch (event.EventType) {
                case 'SubOrchestrationInstanceCompleted':
                case 'SubOrchestrationInstanceFailed':

                    if (!!event.SubOrchestrationId) {

                        const subOrchestrationId = event.SubOrchestrationId;
                        const subOrchestrationName = event.Name;

                        results.push(...this.renderOrchestration(subOrchestrationId, subOrchestrationName, event.history, false));
                        
                        nextLine = `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;
                        results.push({ nextLine });
                    }

                    break;
                case 'TaskCompleted':

                    nextLine = `${this.formatLineName(event.Name, numOfAggregatedEvents)} ${this.formatDuration(event.DurationInMs)}: done, ${this.formatDateTime(eventTimestamp)}, ${this.formatDurationInSeconds(event.DurationInMs)} \n`;
                    results.push({
                        nextLine,
                        functionName: event.Name,
                        parentInstanceId: orchestrationId,
                        duration: event.DurationInMs,
                        widthPercentage: orchDuration ? event.DurationInMs / orchDuration : 0
                    });

                    break;
                case 'TaskFailed':

                    nextLine = `${this.formatLineName(event.Name, numOfAggregatedEvents)} ${this.formatDuration(event.DurationInMs)}: crit, ${this.formatDateTime(eventTimestamp)}, ${this.formatDurationInSeconds(event.DurationInMs)} \n`;
                    results.push({
                        nextLine,
                        functionName: event.Name,
                        parentInstanceId: orchestrationId,
                        duration: event.DurationInMs,
                        widthPercentage: orchDuration ? event.DurationInMs / orchDuration : 0
                    });

                    break;
                case 'TimerFired':

                    nextLine = `[TimerFired]: milestone, ${this.formatDateTime(event.Timestamp)}, 0s \n`;
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