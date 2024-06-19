// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable } from 'mobx'

import { MainState } from './MainState';

// State of Main Menu component
export class MainMenuState {

    @observable
    menuAnchorElement?: Element;

    constructor(private _mainState: MainState) {
    }
    
    showConnectionParamsDialog() {
        this.menuAnchorElement = undefined;

        this._mainState.connectionParamsDialogState.dialogOpen = true;
    }

    showPurgeHistoryDialog() {
        this.menuAnchorElement = undefined;
        
        this._mainState.purgeHistoryDialogState.dialogOpen = true;
    }

    showCleanEntityStorageDialog() {
        this.menuAnchorElement = undefined;

        this._mainState.cleanEntityStorageDialogState.dialogOpen = true;
    }

    showStartNewInstanceDialog() {
        this.menuAnchorElement = undefined;

        this._mainState.startNewInstanceDialogState.dialogOpen = true;
    }

    showBatchOpsDialog() {
        this.menuAnchorElement = undefined;

        this._mainState.batchOpsDialogState.dialogOpen = true;
    }
}