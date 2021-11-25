
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

        // Selecting graph node elements that should be decorated with metrich chips
        const instanceNodes = FunctionGraphTabBase.nodeTypesToHighlight.map(nodeType => Array.from(svgElement.getElementsByClassName(nodeType))).flat();
        var isHighlightedAttributeName = '';
  
        FunctionGraphTabBase.forEachFunctionNode(instanceNodes, (instanceNode, functionName) => {

            const metricsHintNode = document.getElementById(`metrics-hint-${functionName.toLowerCase()}`);
            if (!!metricsHintNode) {

                // Mark this graph node as highlighed
                isHighlightedAttributeName = 'data-is-highlighted';
                instanceNode.setAttribute(isHighlightedAttributeName, 'true');

                // Attaching metrics chip to a node
                const instanceNodeRect = instanceNode.getBoundingClientRect();
                
                metricsHintNode.style.visibility = 'visible';
                metricsHintNode.style.left = `${instanceNodeRect.left + 5}px`;
                metricsHintNode.style.top = `${instanceNodeRect.top - 17}px`;
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