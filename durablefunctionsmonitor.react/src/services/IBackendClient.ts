// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Method } from 'axios';

// Interface for communicating with the backend (sending HTTP requests)
export interface IBackendClient {

    isVsCode: boolean;

    routePrefixAndTaskHubName: string;

    // Sends a request to the backend
    call(method: Method | 'OpenInNewWindow' | 'SaveAs' | 'GotoFunctionCode' | 'GotoBinding' | 'SaveFunctionGraphAsJson', url: string, data?: any): Promise<any>;

    // Opens instance details in a new tab
    showDetails(instanceId: string): void;

    // Downloads data as a file
    download(url: string, fileName: string): Promise<void>;
}