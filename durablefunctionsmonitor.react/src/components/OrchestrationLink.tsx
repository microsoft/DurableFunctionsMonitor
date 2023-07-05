// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import { Link } from '@mui/material';

import { IBackendClient } from '../services/IBackendClient';
import { Theme } from '../theme';

import { renderFilteredField } from './RenderHelpers';

// Renders a link to be opened either in a new browser tab or in a new VsCode WebView
@observer
export class OrchestrationLink extends React.Component<{ orchestrationId: string, title?: string, filterValue?: string, backendClient: IBackendClient }> {

    render(): JSX.Element {

        const linkColor = Theme.palette.mode === 'dark' ? 'inherit' : 'primary';

        return (
            <Link color={linkColor} className="link-with-pointer-cursor" onClick={() => this.props.backendClient.showDetails(this.props.orchestrationId)} >
                {renderFilteredField(this.props.title ?? this.props.orchestrationId, this.props.filterValue)}
            </Link>
        );
    }
}