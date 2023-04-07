// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as vscode from 'vscode';
import axios from 'axios';
import { ConnStringUtils } from './ConnStringUtils';

// Full typings for this can be found here: https://github.com/microsoft/vscode-azure-account/blob/master/src/azure-account.api.d.ts
export type AzureSubscription = { session: { credentials2: any }, subscription: { subscriptionId: string, displayName: string } };

export class EventHubPicker {

    constructor(private _log: (line: string) => void) {}
    
    // Asks user to choose an Event Hub connection string
    async pickEventHubConnectionString(subscription: AzureSubscription): Promise<string | undefined> {

        // Depending on whether ADAL or MSAL is used, this will contain either DeviceTokenCredentials or TokenCredential
        const creds: any = subscription.session.credentials2;
        const subscriptionId = subscription.subscription.subscriptionId;

        const namespaces = await ConnStringUtils.getAzureResources(
            creds,
            subscriptionId,
            'microsoft.eventhub/namespaces'
        )  as { id: string, name: string, sku: any, location: string }[];

        const namespacePickResult = await vscode.window.showQuickPick(
            namespaces.map(n => {
                return {
                    label: n.name,
                    description: `location: ${n.location}, SKU: ${n.sku?.name}`,
                    id: n.id
                };
            }),
            { title: 'Select Azure Event Hubs namespace' }
        );

        if (!namespacePickResult) {

            return;
        }

        const accessToken = await ConnStringUtils.getAccessTokenForAzureResourceManager(creds);

        let authRule: string | undefined = '';

        try {

            const authRules = await this.getRootAuthRules(namespacePickResult.id, accessToken);

            if (authRules.length == 1) {

                authRule = authRules[0];

            } else if (authRules.length > 1) {
                
                authRule = await vscode.window.showQuickPick(authRules, { title: `Select ${namespacePickResult.label} Authorization Rule to use` });
                if (!authRule) {
                    return;
                }
            }
            
        } catch (err: any) {            

            this._log(`Failed to load root authorization rules for namespace ${namespacePickResult.label}. ${err.message ?? err}`);
        }

        if (!!authRule) {
            
            return await this.getConnectionStringForAuthRule(authRule, namespacePickResult.id, accessToken);
        }

        try {

            const authRules = await this.getHubAuthRules(namespacePickResult.id, accessToken);

            if (authRules.length > 0) {
                
                authRule = await vscode.window.showQuickPick(authRules, { title: `Select ${namespacePickResult.label} Authorization Rule to use` });
                if (!authRule) {
                    return;
                }

                return await this.getConnectionStringForAuthRule(authRule, namespacePickResult.id, accessToken);
            }

        } catch (err: any) {            

            this._log(`Failed to load hub authorization rules for namespace ${namespacePickResult.label}. ${err.message ?? err}`);
        }

        throw new Error(`Failed to get an authorization rule for Event Hubs namespace ${namespacePickResult.label}. Connect to your Task Hub by explicitly providing connection strings (use 'Attach to Task Hub...' command for that).`);
    }

    private async getConnectionStringForAuthRule(authRule: string, namespaceId: string, accessToken: string): Promise<string>{

        const keysUri = `https://management.azure.com${namespaceId}/${authRule}/listKeys?api-version=2017-04-01`;
        const keysResponse = await axios.post(keysUri, undefined, { headers: { 'Authorization': `Bearer ${accessToken}` } });

        return keysResponse?.data?.primaryConnectionString;
    }

    private async getRootAuthRules(namespaceId: string, accessToken: string): Promise<string[]> {

        const uri = `https://management.azure.com${namespaceId}/authorizationRules?api-version=2017-04-01`;
        const response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${accessToken}` } });

        if (!response.data?.value) {

            return [];
        }

        return response.data.value.map((r: any) => `authorizationRules/${r.name}`);
    }

    private async getHubAuthRules(namespaceId: string, accessToken: string): Promise<string[]> {

        const uri = `https://management.azure.com${namespaceId}/eventhubs?api-version=2017-04-01`;
        const response = await axios.get(uri, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        const itemNames: string[] = response.data?.value?.map((t: any) => t.name);

        if (!itemNames) { 
            return [];
        }

        const promises = itemNames.map(itemName => {

            const authRulesUri = `https://management.azure.com${namespaceId}/eventhubs/${itemName}/authorizationRules?api-version=2017-04-01`;
            return axios
                .get(authRulesUri, { headers: { 'Authorization': `Bearer ${accessToken}` } })
                .then(authRulesResponse => { 

                    if (!authRulesResponse.data?.value) {
                        return [];
                    }

                    return authRulesResponse.data?.value?.map((r: any) => `eventhubs/${itemName}/authorizationRules/${r.name}`) as string[];
                });
        })

        return (await Promise.all(promises)).flat().sort();
    }
}
