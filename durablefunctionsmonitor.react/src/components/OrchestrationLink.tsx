import * as React from 'react';
import { action } from 'mobx'
import { observer } from 'mobx-react';

import { Link } from '@material-ui/core';

import { IBackendClient } from '../services/IBackendClient';
import { OrchestrationsPathPrefix } from '../states/LoginState';
import { Theme } from '../theme';

// Renders a link to be opened either in a new browser tab or in a new VsCode WebView
@observer
export class OrchestrationLink extends React.Component<{ orchestrationId: string, title?: string, backendClient: IBackendClient }> {

    render(): JSX.Element {

        if (this.props.backendClient.isVsCode) {

            return (
                <Link color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} className="link-with-pointer-cursor" onClick={this.onLinkClicked} >
                    {this.props.title ?? this.props.orchestrationId}
                </Link>
            );            
        } else {

            return (
                <Link color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} href={`${this.props.backendClient.routePrefixAndTaskHubName}${OrchestrationsPathPrefix}${this.extraSanitizeHrefComponent(this.props.orchestrationId)}`} target="_blank">
                    {this.props.title ?? this.props.orchestrationId}
                </Link>
            );
        }
    }

    @action.bound
    private onLinkClicked() {
        this.props.backendClient.call('OpenInNewWindow', this.props.orchestrationId);
    }

    // Just to be extra sure
    private extraSanitizeHrefComponent(s: string): string{
        return s.replace(/javascript:/gi, '');
    }
}