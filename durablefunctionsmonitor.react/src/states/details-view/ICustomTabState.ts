// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { DurableOrchestrationStatus } from '../DurableOrchestrationStatus';
import { CancelToken } from '../../CancelToken';

export enum CustomTabTypeEnum {
    RawHtml = 0,
    MermaidDiagram,
    FunctionGraph
}

// Represents states of custom tabs
export interface ICustomTabState {

    name: string;
    description: string;
    rawHtml: string;
    tabType: CustomTabTypeEnum;

    load(details: DurableOrchestrationStatus, cancelToken: CancelToken): Promise<void>;
}
