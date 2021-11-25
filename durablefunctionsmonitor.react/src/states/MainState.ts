import { observable, computed } from 'mobx';

import { IBackendClient } from '../services/IBackendClient';
import { BackendClient } from '../services/BackendClient';
import { LoginState, OrchestrationsPathPrefix } from './LoginState';
import { MainMenuState } from './MainMenuState';
import { OrchestrationsState } from './results-view/OrchestrationsState';
import { ResultsListTabState } from './results-view/ResultsListTabState';
import { OrchestrationDetailsState } from './details-view/OrchestrationDetailsState';
import { FunctionGraphState } from './FunctionGraphState';
import { PurgeHistoryDialogState } from './dialogs/PurgeHistoryDialogState';
import { CleanEntityStorageDialogState } from './dialogs/CleanEntityStorageDialogState';
import { ConnectionParamsDialogState } from './dialogs/ConnectionParamsDialogState';
import { StartNewInstanceDialogState } from './dialogs/StartNewInstanceDialogState';
import { TypedLocalStorage } from './TypedLocalStorage';
import { VsCodeBackendClient } from '../services/VsCodeBackendClient';
import { VsCodeTypedLocalStorage } from './VsCodeTypedLocalStorage';

// This method is provided by VsCode, when running inside a WebView
declare const acquireVsCodeApi: () => any;

// Global variables declared in index.html and replaced by VsCode extension
declare const OrchestrationIdFromVsCode: string;
declare const IsFunctionGraphAvailable: boolean;

enum DfmViewModeEnum {
    DurableFunctions = 0,
    FunctionGraph
}
declare const DfmViewMode: DfmViewModeEnum;

// Main Application State
export class MainState  {
    
    readonly loginState?: LoginState;    
    readonly mainMenuState?: MainMenuState;
    readonly orchestrationsState?: OrchestrationsState;
    readonly orchestrationDetailsState?: OrchestrationDetailsState;
    readonly functionGraphState?: FunctionGraphState;
    readonly purgeHistoryDialogState: PurgeHistoryDialogState;
    readonly cleanEntityStorageDialogState: CleanEntityStorageDialogState;
    readonly connectionParamsDialogState: ConnectionParamsDialogState;
    readonly startNewInstanceDialogState: StartNewInstanceDialogState;

    @observable
    menuAnchorElement?: Element;

    @computed
    get typedInstanceId(): string {
        return this._typedInstanceId;
    }
    set typedInstanceId(s: string) {
        this._typedInstanceId = s;
        this.reloadSuggestions();
    }

    @computed
    get suggestions(): string[] {
        return this._suggestions;
    }

    @computed
    get isExactMatch(): boolean {
        return this._suggestions.length === 1 && this._suggestions[0] === this._typedInstanceId;
    }
    
    constructor() {

        // checking whether we're inside VsCode
        var vsCodeApi: any = undefined;
        try {
            vsCodeApi = acquireVsCodeApi();
        } catch { }

        if (!!vsCodeApi) {

            const backendClient = new VsCodeBackendClient(vsCodeApi);
            this._backendClient = backendClient;

            this.purgeHistoryDialogState = new PurgeHistoryDialogState(backendClient);
            this.cleanEntityStorageDialogState = new CleanEntityStorageDialogState(backendClient);
            this.startNewInstanceDialogState = new StartNewInstanceDialogState(backendClient);

            if (DfmViewMode === DfmViewModeEnum.FunctionGraph) {

                this.functionGraphState = new FunctionGraphState(backendClient);

            } else if (!!this.instanceId) {

                this.orchestrationDetailsState = new OrchestrationDetailsState(this.instanceId,
                    IsFunctionGraphAvailable,
                    backendClient,
                    new VsCodeTypedLocalStorage<OrchestrationDetailsState>('OrchestrationDetailsState', vsCodeApi));
                
            } else {

                this.orchestrationsState = new OrchestrationsState(IsFunctionGraphAvailable,
                    backendClient,
                    new VsCodeTypedLocalStorage<OrchestrationsState & ResultsListTabState>('OrchestrationsState', vsCodeApi),
                    funcName => this.startNewInstanceDialogState.showWithFunctionName(funcName));

                // This needs to be done after state instances are created, but it needs to be done anyway
                backendClient.setCustomHandlers({
                    purgeHistory: () => this.purgeHistoryDialogState.dialogOpen = true,
                    cleanEntityStorage: () => this.cleanEntityStorageDialogState.dialogOpen = true,
                    startNewInstance: () => this.startNewInstanceDialogState.dialogOpen = true,
                });
            }
            
        } else {

            this.loginState = new LoginState();

            const backendClient = new BackendClient(() => this.loginState.taskHubName, () => this.loginState.getAuthorizationHeaderAsync());
            this._backendClient = backendClient;

            this.purgeHistoryDialogState = new PurgeHistoryDialogState(backendClient);
            this.cleanEntityStorageDialogState = new CleanEntityStorageDialogState(backendClient);
            this.connectionParamsDialogState = new ConnectionParamsDialogState(backendClient);
            this.startNewInstanceDialogState = new StartNewInstanceDialogState(backendClient);

            if (!!this.instanceId) {

                this.orchestrationDetailsState = new OrchestrationDetailsState(this.instanceId,
                    IsFunctionGraphAvailable,
                    backendClient, 
                    new TypedLocalStorage<OrchestrationDetailsState>('OrchestrationDetailsState'));
                
            } else {

                this.mainMenuState = new MainMenuState(backendClient, this.purgeHistoryDialogState, this.cleanEntityStorageDialogState, this.connectionParamsDialogState, this.startNewInstanceDialogState);
                
                this.orchestrationsState = new OrchestrationsState(IsFunctionGraphAvailable,
                    backendClient,
                    new TypedLocalStorage<OrchestrationsState>('OrchestrationsState'),
                    funcName => this.startNewInstanceDialogState.showWithFunctionName(funcName));
            }
        }
    }

    // Opens the entered orchestrationId in a new tab
    goto() {
        window.open(`${this._backendClient.routePrefixAndTaskHubName}${OrchestrationsPathPrefix}${this._typedInstanceId}`);
        this._typedInstanceId = '';
        this._suggestions = [];
    }

    @observable
    private _suggestions: string[] = [];
    @observable
    private _typedInstanceId: string = '';

    private readonly _backendClient: IBackendClient;

    // Extracts orchestrationId from URL or from VsCode
    private get instanceId(): string {

        if (!!OrchestrationIdFromVsCode) {
            return OrchestrationIdFromVsCode;
        }

        const pos = window.location.pathname.lastIndexOf(OrchestrationsPathPrefix);
        if (pos < 0) {
            return '';
        }

        return window.location.pathname.substr(pos + OrchestrationsPathPrefix.length);
    }

    // Reloads list of suggested instanceIds
    private reloadSuggestions(): void {

        if (!this._typedInstanceId || this._typedInstanceId.length < 2) {
            this._suggestions = [];
            return;
        }

        const uri = `/id-suggestions(prefix='${this._typedInstanceId}')`;
        this._backendClient.call('GET', uri).then(response => {

            if (!response || !this._typedInstanceId) {
                this._suggestions = [];
            } else {
                this._suggestions = response;
            }
        });
    }
}