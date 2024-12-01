// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable, computed } from 'mobx';

import { IBackendClient } from '../services/IBackendClient';
import { MermaidDiagramStateBase } from './MermaidDiagramStateBase';
import { FunctionsMap, ProxiesMap } from 'az-func-as-a-graph.core/dist/FunctionsMap';

export type TraversalResult = {
    functions: FunctionsMap;
    proxies: ProxiesMap;
    iconsSvg: string;
};

// ID of an embedded SVG element containing Azure service icons. Should be present in index.html
const AllAzureIconsSvgElementId = "all-azure-icons-svg";

// Base class for all Function Graph states
export class FunctionGraphStateBase extends MermaidDiagramStateBase {

    @computed
    get diagramCode(): string { return this._diagramCode; };

    @computed
    get diagramSvg(): string { return this._diagramSvg; };

    @computed
    get functionsLoaded(): boolean { return !!this._traversalResult; };

    get backendClient(): IBackendClient { return this._backendClient; }

    constructor(protected _backendClient: IBackendClient) {
        super();
    }

    gotoFunctionCode(functionName: string): void {

        if (this.backendClient.isVsCode) {
            
            this.backendClient.call('GotoFunctionCode', functionName).then(() => { }, err => {
                console.log(`Failed to goto function code: ${err.message}`);
            });

        } else {

            var functionOrProxy = null;

            if (functionName.startsWith('proxy.')) {
                
                functionOrProxy = this._traversalResult.proxies[functionName.substr(6)];

            } else {

                functionOrProxy = this._traversalResult.functions[functionName];
            }

            if (!!functionOrProxy && !!functionOrProxy.filePath) {
                window.open(functionOrProxy.filePath);
            }
        }
    }

    gotoBinding(functionName: string, bindingIndex: number): void {

        if (this.backendClient.isVsCode) {
            
            this.backendClient.call('GotoBinding', functionName, bindingIndex).then(() => { }, err => {
                console.log(`Failed to goto binding: ${err.message}`);
            });
        }
    }

    saveAsJson(): void {

        this.backendClient.call('SaveFunctionGraphAsJson', '').then(() => { }, err => {
            console.log(`Failed to goto function code: ${err.message}`);
        });
    }

    @observable
    protected _renderFunctions: boolean = true;
    @observable
    protected _renderProxies: boolean = true;
    @observable
    protected _traversalResult: TraversalResult;

    protected applyIcons(svg: string): string {

        const iconsSvgElement = document.getElementById(AllAzureIconsSvgElementId);
        if (!iconsSvgElement) {
            return svg;
        }

        // Placing icons code into a <defs> block at the top
        svg = svg.replace(`><style>`, `>\n<defs>\n${iconsSvgElement.innerHTML}</defs>\n<style>`);

        svg = svg.replace(/<g transform="translate\([0-9,.-\s]+\)" data-id="[^"]+" data-node="true" id="[^"]+" class="node default (\w+).*?<g transform="translate\([0-9,.-\s]+\)" style="" class="label">/g,
            `$&<use href="#az-icon-$1" width="20px" height="20px"/>`);

        return svg;
    }

    protected addSpaceForIcons(diagramCode: string): string {

        const spaces = `#8194;#8194;#8194;`;
        diagramCode = diagramCode.replace(/#32;/g, spaces);
        diagramCode = diagramCode.replace(/#127760;/g, `${spaces}🌐`);
        diagramCode = diagramCode.replace(/#128274;/g, `${spaces}🔒`);

        return diagramCode;
    }
}