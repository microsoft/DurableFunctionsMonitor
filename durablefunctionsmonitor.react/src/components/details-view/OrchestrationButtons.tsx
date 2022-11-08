// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
    FormControlLabel, TextField
} from '@material-ui/core';

import Autocomplete from '@material-ui/lab/Autocomplete';

import { OrchestrationDetailsState } from '../../states/details-view/OrchestrationDetailsState';

import { PrimaryButtonColor } from '../../theme';

// Buttons for detailed orchestration view
@observer
export class OrchestrationButtons extends React.Component<{ state: OrchestrationDetailsState, disabled: boolean }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (<>

            {this.renderDialogs(state)}

            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.suspendDialogOpen = true}>
                Suspend
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.resumeDialogOpen = true}>
                Resume
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.restartDialogOpen = true}>
                Restart
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.rewindConfirmationOpen = true}>
                Rewind
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.terminateConfirmationOpen = true}>
                Terminate
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.raiseEventDialogOpen = true}>
                Raise Event
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.setCustomStatusDialogOpen = true}>
                Set Custom Status
            </Button>
            <Box width={7} />
            <Button variant="outlined" color={PrimaryButtonColor} size="small" disabled={this.props.disabled} onClick={() => state.purgeConfirmationOpen = true}>
                Purge
            </Button>           
            
        </>);
    }

    private renderDialogs(state: OrchestrationDetailsState): JSX.Element {
        return (<>

            <Dialog
                open={state.rewindConfirmationOpen}
                onClose={() => state.rewindConfirmationOpen = false}
            >
                <DialogTitle>Confirm Rewind</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You're about to rewind orchestration '{state.orchestrationId}'. Are you sure?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.rewindConfirmationOpen = false} color={PrimaryButtonColor} autoFocus>
                        Cancel
                    </Button>
                    <Button onClick={() => state.rewind()} color="secondary">
                        Yes, rewind
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={state.terminateConfirmationOpen}
                onClose={() => state.terminateConfirmationOpen = false}
            >
                <DialogTitle>Confirm Terminate</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You're about to terminate orchestration '{state.orchestrationId}'. This operation cannot be undone. Are you sure?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.terminateConfirmationOpen = false} color={PrimaryButtonColor} autoFocus>
                        Cancel
                    </Button>
                    <Button onClick={() => state.terminate()} color="secondary">
                        Yes, terminate
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                fullWidth={true}
                open={state.raiseEventDialogOpen}
                onClose={() => state.raiseEventDialogOpen = false}
            >
                <DialogTitle>Raise Event</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Provide event name and some additional data
                    </DialogContentText>
                    
                    <Autocomplete
                        freeSolo
                        options={state.eventNames}
                        value={state.eventName}
                        onChange={(evt, newValue) => {
                            state.eventName = newValue ?? '';
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                autoFocus
                                margin="dense"
                                label="Event Name"
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                value={state.eventName}
                                onChange={(evt) => state.eventName = evt.target.value as string}
                            />
                        )}
                    />

                    <TextField
                        margin="dense"
                        label="Event Data (JSON)"
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
                        Raise
                    </Button>
                </DialogActions>
            </Dialog>
            
            <Dialog
                fullWidth={true}
                open={state.setCustomStatusDialogOpen}
                onClose={() => state.setCustomStatusDialogOpen = false}
            >
                <DialogTitle>Set customStatus</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        customStatus field is a way for external clients to differentiate instances of your orchestration. It does not affect the orchestration workflow itself.
                    </DialogContentText>

                    <TextField
                        margin="dense"
                        InputLabelProps={{ shrink: true }}
                        label="New customStatus (JSON)"
                        fullWidth
                        multiline
                        rows={10}
                        value={state.newCustomStatus}
                        onChange={(evt) => state.newCustomStatus = evt.target.value as string}
                    />

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.setCustomStatusDialogOpen = false} color={PrimaryButtonColor}>
                        Cancel
                    </Button>
                    <Button onClick={() => state.setCustomStatus()} disabled={!state.isCustomStatusDirty} color="secondary">
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={state.purgeConfirmationOpen}
                onClose={() => state.purgeConfirmationOpen = false}
            >
                <DialogTitle>Confirm Purge</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You're about to purge orchestration '{state.orchestrationId}'. This operation drops orchestration state from the underlying storage and cannot be undone. Are you sure?
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
                open={state.restartDialogOpen}
                onClose={() => state.restartDialogOpen = false}
            >
                <DialogTitle>Confirm Restart</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You're about to restart orchestration '{state.orchestrationId}'. Are you sure?
                    </DialogContentText>

                    <FormControlLabel control={<Checkbox
                        checked={state.restartWithNewInstanceId}
                        onChange={(evt) => state.restartWithNewInstanceId = evt.target.checked} />}
                        label="Restart with new instanceId"
                    />

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.restartDialogOpen = false} color={PrimaryButtonColor} autoFocus>
                        Cancel
                    </Button>
                    <Button onClick={() => state.restart()} color="secondary">
                        Restart
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={state.suspendDialogOpen}
                onClose={() => state.suspendDialogOpen = false}
            >
                <DialogTitle>Suspend Orchestration</DialogTitle>
                <DialogContent>

                    <TextField
                        margin="dense"
                        InputLabelProps={{ shrink: true }}
                        label="Reason (optional)"
                        fullWidth
                        value={state.suspendResumeReason}
                        onChange={(evt) => state.suspendResumeReason = evt.target.value as string}
                    />

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.suspendDialogOpen = false} color={PrimaryButtonColor}>
                        Cancel
                    </Button>
                    <Button onClick={() => state.suspendResume(false)} color="secondary">
                        Suspend
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={state.resumeDialogOpen}
                onClose={() => state.resumeDialogOpen = false}
            >
                <DialogTitle>Resume Orchestration</DialogTitle>
                <DialogContent>

                    <TextField
                        margin="dense"
                        InputLabelProps={{ shrink: true }}
                        label="Reason (optional)"
                        fullWidth
                        value={state.suspendResumeReason}
                        onChange={(evt) => state.suspendResumeReason = evt.target.value as string}
                    />

                </DialogContent>
                <DialogActions>
                    <Button onClick={() => state.resumeDialogOpen = false} color={PrimaryButtonColor}>
                        Cancel
                    </Button>
                    <Button onClick={() => state.suspendResume(true)} color="secondary">
                        Resume
                    </Button>
                </DialogActions>
            </Dialog>
        </>);
    }
}