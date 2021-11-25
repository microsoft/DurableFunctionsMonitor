import { observable } from 'mobx';
import mermaid from 'mermaid';
import { DateTimeHelpers } from '../DateTimeHelpers';

// Base class for all mermaid-related states
export abstract class MermaidDiagramStateBase {

    @observable
    protected _diagramCode: string;
    @observable
    protected _diagramSvg: string;

    protected initMermaidWhenNeeded() : void {

        if (MermaidDiagramStateBase._mermaidInitialized) { 
            return;
        }

        mermaid.initialize({
            startOnLoad: true,
            
            sequence: {
                noteMargin: 0,
                boxMargin: 5,
                boxTextMargin: 5
            },

            flowchart: {
                curve: 'Basis',
                useMaxWidth: true,
                htmlLabels: false
            }
        });

        MermaidDiagramStateBase._mermaidInitialized = true;
    }

    protected escapeTitle(id: string) {

        return id.replace(/[@:;]/g, ' ');
    }

    protected formatDuration(durationInMs: number): string {

        const result = DateTimeHelpers.formatDuration(durationInMs);
        return !result ? '' : `(${result})`;
    }

    protected formatDurationInSeconds(durationInMs: number): string {

        return Math.ceil(durationInMs / 1000).toFixed(0) + 's';
    }

    private static _mermaidInitialized = false;
}