// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable } from 'mobx'

// State of Error Message snackbar
export class ErrorMessageState {

    @observable
    errorMessage: string = '';

    static formatErrorMessage(msg: string, err: any): string {
        
        if (typeof err === 'string') {
            return `${msg}. ${err}`;
        } else if (!!err.response?.data && typeof err.response?.data === 'string') {
            return `${msg}. ${err.response.data}`;
        } else {
            return `${msg}. ${err.message}`;
        }
    }

    protected showError(msg: string, err: any) {

        this.errorMessage = ErrorMessageState.formatErrorMessage(msg, err);
    }
}