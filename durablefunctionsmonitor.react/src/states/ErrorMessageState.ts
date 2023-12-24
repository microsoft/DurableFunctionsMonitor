// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable } from 'mobx'

// State of Error Message snackbar
export class ErrorMessageState {

    @observable
    errorMessage: string = '';

    protected showError(msg: string, err: any) {

        if (typeof err === 'string') {
            this.errorMessage = `${msg}. ${err}`;
        } else if (typeof err.response?.data === 'string') {
            this.errorMessage = `${msg}. ${err.response.data}`;
        } else {
            this.errorMessage = `${msg}. ${err.message}`;
        }
    }
}