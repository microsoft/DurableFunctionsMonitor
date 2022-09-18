// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FunctionGraphStateBase } from '../states/FunctionGraphStateBase';
import { FunctionGraphBase } from './FunctionGraphBase';

import { RuntimeStatusToBadgeStyle } from '../theme';

// Generic routines for tabs showing Function Graphs
export class FunctionGraphTabBase<P extends { state: FunctionGraphStateBase }> extends FunctionGraphBase<P> {

    protected readonly RunningStyle = RuntimeStatusToBadgeStyle('Running');
    protected readonly CompletedStyle = RuntimeStatusToBadgeStyle('Completed');
    protected readonly FailedStyle = RuntimeStatusToBadgeStyle('Failed');
    protected readonly OtherStyle = RuntimeStatusToBadgeStyle('Terminated');
    protected readonly DurationStyle = RuntimeStatusToBadgeStyle('Duration');

    protected static nodeTypesToHighlight: Array<'orchestrator' | 'entity' | 'activity'> = ['orchestrator', 'entity'];

    protected static readonly clickableBindingTypes = [
        'blobTrigger',
        'eventHubTrigger',
        'serviceBusTrigger',
        'queueTrigger',
        'table',
        'blob',
        'queue',
        'eventHub',
        'serviceBus',
    ];

    // Detects graph nodes that look like bindings and executes an action against them
    protected forEachBindingNode(nodes: HTMLCollectionOf<Element> | Array<Element>, action: (node: HTMLElement, functionName: string, bindingIndex: number) => void) {
        
        for (var i = 0; i < nodes.length; i++) {
            const el = nodes[i] as HTMLElement;

            const match = /flowchart-(.+).binding(\d+)\./.exec(el.id);
            if (!!match) {
                action(el, match[1], parseInt(match[2]));
            }
        }
    }

    protected mountClickEventToBindingNodes(nodes: HTMLCollection): void {

        const state = this.props.state;

        // Navigating to bindings is only supported in VsCode ext
        if (!!state.backendClient.isVsCode) {
            
            this.forEachBindingNode(nodes, (el, functionName, bindingIndex) => {

                el.onclick = () => state.gotoBinding(functionName, bindingIndex);
    
                this.showAsClickable(el);
            })
        }
    }

    // Handles window and graph resize. Must remain static and shouldn't use 'this'.
    protected static repositionMetricHints() {

        // Hiding all metrics first
        const allMetricsHintNodes = document.getElementsByClassName('metrics-span');
        for (var i = 0; i < allMetricsHintNodes.length; i++) {
            const metricsHintNode = allMetricsHintNodes[i] as HTMLElement;
            metricsHintNode.style.visibility = 'hidden';
        }
        
        const svgElement = document.getElementById('mermaidSvgId');
        if (!svgElement) {
            return;
        }

        // Selecting graph node elements that should be decorated with metric chips
        const instanceNodes = FunctionGraphTabBase.nodeTypesToHighlight.map(nodeType => Array.from(svgElement.getElementsByClassName(nodeType))).flat();
        var isHighlightedAttributeName = '';
  
        FunctionGraphBase.forEachFunctionNode(instanceNodes, (instanceNode, functionName) => {

            const metricsHintNode = document.getElementById(`metrics-hint-${functionName.toLowerCase()}`);
            if (!!metricsHintNode) {

                // Mark this graph node as highlighed
                isHighlightedAttributeName = 'data-is-highlighted';
                instanceNode.setAttribute(isHighlightedAttributeName, 'true');

                // Attaching metrics chip to a node
                const instanceNodeRect = instanceNode.getBoundingClientRect();
                
                metricsHintNode.style.visibility = 'visible';
                metricsHintNode.style.left = `${instanceNodeRect.left + window.scrollX + 5}px`;
                metricsHintNode.style.top = `${instanceNodeRect.top + window.scrollY - 17}px`;
            }
        });

        // Dimming those nodes that are not highlighted
        if (!!isHighlightedAttributeName) {
            for (var node of Array.from(svgElement.getElementsByClassName('node'))) {

                (node as HTMLElement).style.opacity = !node.getAttribute(isHighlightedAttributeName) ? '0.6' : '1';
            }
        }
    }
}