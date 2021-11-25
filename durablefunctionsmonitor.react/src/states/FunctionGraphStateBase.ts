import { observable, computed } from 'mobx';

import { IBackendClient } from '../services/IBackendClient';
import { MermaidDiagramStateBase } from './MermaidDiagramStateBase';
import { FunctionsMap, ProxiesMap } from './az-func-as-a-graph/FunctionsMap';

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

        // Adding <use> blocks referencing relevant icons
        svg = svg.replace(/<g class="node (\w+).*?<g class="label" transform="translate\([0-9,.-]+\)"><g transform="translate\([0-9,.-]+\)">/g,
            `$&<use href="#az-icon-$1" width="20px" height="20px"/>`);

        return svg;
    }
}