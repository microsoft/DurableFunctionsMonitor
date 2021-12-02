// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { observable } from 'mobx'

export class CancelToken {
    @observable
    inProgress: boolean = false;
    @observable
    isCancelled: boolean = false;
}
