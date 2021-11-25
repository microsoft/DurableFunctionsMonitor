import mermaid from 'mermaid';
import moment from 'moment';

import { DurableOrchestrationStatus, HistoryEvent } from '../DurableOrchestrationStatus';
import { MermaidDiagramTabState } from './MermaidDiagramTabState';
import { CancelToken } from '../../CancelToken';
import { dfmContextInstance } from '../../DfmContext';

type LineTextAndMetadata = { nextLine: string, functionName?: string, instanceId?: string, parentInstanceId?: string, duration?: number, widthPercentage?: number };

// State of Gantt Diagram tab on OrchestrationDetails view
export class GanttDiagramTabState extends MermaidDiagramTabState {

    readonly name: string = "Gantt Chart";

    protected buildDiagram(details: DurableOrchestrationStatus, history: HistoryEvent[], cancelToken: CancelToken): Promise<void> {

        return new Promise<void>((resolve, reject) => {
            Promise.all(this.renderOrchestration(details.instanceId, details.name, history, true)).then(arrayOfArrays => {

                if (cancelToken.isCancelled) {

                    resolve();
                    return;
                }

                const lines = arrayOfArrays.flat();
                const linesWithMetadata = lines.filter(l => !!l.functionName);

                this._diagramCode = 'gantt \n' +
                    `title ${details.name}(${details.instanceId}) \n` +
                    'dateFormat YYYY-MM-DDTHH:mm:ss.SSS \n' +
                    lines.map(item => item.nextLine).join('');

                // Very much unknown, why this line is needed. Without it sometimes the diagrams fail to re-render
                this._diagramSvg = '';

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

            }, reject);
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

    private renderOrchestration(orchestrationId: string, orchestrationName: string, historyEvents: HistoryEvent[], isParentOrchestration: boolean):
        Promise<LineTextAndMetadata[]>[] {

        const results: Promise<LineTextAndMetadata[]>[] = [];

        const startedEvent = historyEvents.find(event => event.EventType === 'ExecutionStarted');
        const completedEvent = historyEvents.find(event => event.EventType === 'ExecutionCompleted');

        var needToAddAxisFormat = isParentOrchestration;
        var nextLine: string;
        var orchDuration = 0;

        if (!!startedEvent && !!completedEvent) {

            if (needToAddAxisFormat) {

                const longerThanADay = completedEvent.DurationInMs > 86400000;
                nextLine = longerThanADay ? 'axisFormat %Y-%m-%d %H:%M \n' : 'axisFormat %H:%M:%S \n';
                results.push(Promise.resolve([{ nextLine }]));
                needToAddAxisFormat = false;
            }
            
            nextLine = isParentOrchestration ? '' : `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;

            var lineName = this.formatDuration(completedEvent.DurationInMs);
            if (!lineName) {
                lineName = this.formatLineName(orchestrationName);
            }

            nextLine += `${lineName}: ${isParentOrchestration ? '' : 'active,'} ${this.formatDateTime(startedEvent.Timestamp)}, ${this.formatDurationInSeconds(completedEvent.DurationInMs)} \n`;
            results.push(Promise.resolve([{ nextLine, functionName: orchestrationName, instanceId: orchestrationId }]));
            
            orchDuration = completedEvent.DurationInMs;
        }

        if (needToAddAxisFormat) {

            nextLine = 'axisFormat %H:%M:%S \n';
            results.push(Promise.resolve([{ nextLine }]));
        }

        for (var event of historyEvents) {

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
                        
                        results.push(new Promise<LineTextAndMetadata[]>((resolve, reject) => {
                            this._loadHistory(subOrchestrationId).then(history => {

                                Promise.all(this.renderOrchestration(subOrchestrationId, subOrchestrationName, history, false)).then(sequenceLines => {

                                    resolve(sequenceLines.flat());

                                }, reject);

                            }, err => {

                                console.log(`Failed to load ${subOrchestrationName}. ${err.message}`);
                                resolve([{ nextLine: `%% Failed to load ${this.formatLineName(subOrchestrationName)}. ${err.message} \n` }]);
                            });
                        }));

                        nextLine = `section ${orchestrationName}(${this.escapeTitle(orchestrationId)}) \n`;
                        results.push(Promise.resolve([{ nextLine }]));
                    }

                    break;
                case 'TaskCompleted':

                    nextLine = `${this.formatLineName(event.Name)} ${this.formatDuration(event.DurationInMs)}: done, ${this.formatDateTime(eventTimestamp)}, ${this.formatDurationInSeconds(event.DurationInMs)} \n`;
                    results.push(Promise.resolve([{
                        nextLine,
                        functionName: event.Name,
                        parentInstanceId: orchestrationId,
                        duration: event.DurationInMs,
                        widthPercentage: orchDuration ? event.DurationInMs / orchDuration : 0
                    }]));

                    break;
                case 'TaskFailed':

                    nextLine = `${this.formatLineName(event.Name)} ${this.formatDuration(event.DurationInMs)}: crit, ${this.formatDateTime(eventTimestamp)}, ${this.formatDurationInSeconds(event.DurationInMs)} \n`;
                    results.push(Promise.resolve([{
                        nextLine,
                        functionName: event.Name,
                        parentInstanceId: orchestrationId,
                        duration: event.DurationInMs,
                        widthPercentage: orchDuration ? event.DurationInMs / orchDuration : 0
                    }]));

                    break;
                    case 'TimerFired':

                        nextLine = `[TimerFired]: done, ${this.formatDateTime(event.Timestamp)}, 1s \n`;
                        results.push(Promise.resolve([{
                            nextLine,
                            functionName: orchestrationName,
                            parentInstanceId: orchestrationId,
                            duration: 1,
                            widthPercentage: 0.0001
                        }]));
    
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

    private formatLineName(name: string): string {

        return name.replace(/:/g, '-');
    }
}