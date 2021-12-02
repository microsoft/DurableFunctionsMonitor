// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField
} from '@material-ui/core';

import { OrchestrationDetailsState } from '../../states/details-view/OrchestrationDetailsState';

import { PrimaryButtonColor } from '../../theme';

// Buttons for detailed durable entity view
@observer
export class DurableEntityButtons extends React.Component<{ state: OrchestrationDetailsState, disabled: boolean }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (<>

            {this.renderDialogs(state)}

            <Button variant="outlined" color={PrimaryButtonColor} size="medium" disabled={this.props.disabled} onClick={() => state.purgeConfirmationOpen = true}>
                Purge
            </Button>
            <Box width={10} />
            <Button variant="outlined" color={PrimaryButtonColor} size="medium" disabled={this.props.disabled} onClick={() => state.raiseEventDialogOpen = true}>
                Send Signal
            </Button>
        </>);
    }

    private renderDialogs(state: OrchestrationDetailsState): JSX.Element {
        return (<>

            <Dialog
                open={state.purgeConfirmationOpen}
                onClose={() => state.purgeConfirmationOpen = false}
            >
                <DialogTitle>Confirm Purge</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You're about to purge entity '{state.orchestrationId}'. This operation drops entity state from the underlying storage and cannot be undone. Are you sure?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.purgeConfirmationOpen = false} color={PrimaryButtonColor} autoFocus>
                        Cancel
                    </Button>
                    <Button onClick={() => state.purge()} color="secondary">
                        Yes, purge
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                fullWidth={true}
                open={state.raiseEventDialogOpen}
                onClose={() => state.raiseEventDialogOpen = false}
            >
                <DialogTitle>Send Signal</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Provide signal name and some additional data
                    </DialogContentText>

                    <TextField
                        autoFocus
                        margin="dense"
                        label="Signal Name"
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                        value={state.eventName}
                        onChange={(evt) => state.eventName = evt.target.value as string}
                    />

                    <TextField
                        margin="dense"
                        label="Signal Data (JSON)"
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                        multiline
                        rows={7}
                        value={state.eventData}
                        onChange={(evt) => state.eventData = evt.target.value as string}
                    />

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.raiseEventDialogOpen = false} color={PrimaryButtonColor}>
                        Cancel
                    </Button>
                    <Button onClick={() => state.raiseEvent()} disabled={!state.eventName} color="secondary">
                        Send
                    </Button>
                </DialogActions>
            </Dialog>

        </>);
    }
}