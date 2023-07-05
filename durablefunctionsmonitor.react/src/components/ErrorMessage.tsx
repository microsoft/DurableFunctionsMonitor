// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { action } from 'mobx'
import { observer } from 'mobx-react';

import { IconButton, Snackbar, SnackbarContent } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';

import './ErrorMessage.css';

// Error Message Snackbar
@observer
export class ErrorMessage extends React.Component<{ state: { errorMessage: string } }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (

            <Snackbar
                className="message-snackbar"
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                open={!!state.errorMessage}
                autoHideDuration={6000}
                onClose={this.handleClose}
            >
                <SnackbarContent
                    className="error-snackbar-content"
                    message={
                        <span>
                            <ErrorIcon className="error-icon" />
                            {state.errorMessage}
                        </span>
                    }
                    action={[
                        <IconButton
                            key="close"
                            aria-label="Close"
                            color="inherit"
                            onClick={this.handleClose}
                        >
                            <CloseIcon />
                        </IconButton>,
                    ]}
                />

            </Snackbar>
        );
    }

    @action.bound
    private handleClose() {
        this.props.state.errorMessage = '';
    }
}