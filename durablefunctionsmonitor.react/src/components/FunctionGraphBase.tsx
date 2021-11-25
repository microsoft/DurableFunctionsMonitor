import * as React from 'react';

import './FunctionGraph.css';

import { FunctionGraphStateBase } from '../states/FunctionGraphStateBase';

// Generic routines for all pages showing Function Graphs
export class FunctionGraphBase<P extends { state: FunctionGraphStateBase }> extends React.Component<P> {

    // Detects graph nodes that look like Functions and executes an action against them
    protected static forEachFunctionNode(nodes: HTMLCollectionOf<Element> | Array<Element>, action: (node: HTMLElement, functionName: string) => void) {
        
        for (var i = 0; i < nodes.length; i++) {
            const el = nodes[i] as HTMLElement;

            const match = /flowchart-(.+)-/.exec(el.id);
            if (!!match) {
                action(el, match[1]);
            }
        }
    }

    protected mountClickEventToFunctionNodes(nodes: HTMLCollection): void {

        const state = this.props.state;

        FunctionGraphBase.forEachFunctionNode(nodes, (el, functionName) => {

            el.onclick = () => state.gotoFunctionCode(functionName);

            this.showAsClickable(el);
        })
    }

    protected showAsClickable(el: HTMLElement) {
        
        el.style.cursor = 'pointer';
        el.onmouseenter = (evt) => { (evt.target as HTMLElement).style.strokeOpacity = '0.5'; };
        el.onmouseleave = (evt) => { (evt.target as HTMLElement).style.strokeOpacity = '1'; };
    }
}