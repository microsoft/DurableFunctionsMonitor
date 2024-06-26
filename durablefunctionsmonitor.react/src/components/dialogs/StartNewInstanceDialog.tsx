// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, TextField
} from '@mui/material';

import './StartNewInstanceDialog.css';

import { ErrorMessage } from '../ErrorMessage';
import { StartNewInstanceDialogState } from '../../states/dialogs/StartNewInstanceDialogState';

import { PrimaryButtonColor } from '../../theme';

// Dialog for starting a new orchestration instance
@observer
export class StartNewInstanceDialog extends React.Component<{ state: StartNewInstanceDialogState }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (<Dialog open={state.dialogOpen} onClose={() => { if (!state.inProgress) state.dialogOpen = false; }}>
            
            <DialogTitle>Start New Orchestration Instance</DialogTitle>

            <DialogContent>

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                <TextField
                    className="dialog-text-field"
                    margin="dense"
                    label="InstanceId (optional)"
                    fullWidth
                    disabled={state.inProgress}
                    InputLabelProps={{ shrink: true }}
                    value={state.instanceId}
                    onChange={(evt) => state.instanceId = evt.target.value as string}
                />

                <TextField
                    className="dialog-text-field"
                    autoFocus
                    margin="dense"
                    label="Orchestrator Function Name"
                    fullWidth
                    disabled={state.inProgress}
                    InputLabelProps={{ shrink: true }}
                    value={state.orchestratorFunctionName}
                    onChange={(evt) => state.orchestratorFunctionName = evt.target.value as string}
                />

                <TextField
                    margin="dense"
                    disabled={state.inProgress}
                    InputLabelProps={{ shrink: true }}
                    label="Input (optional JSON)"
                    fullWidth
                    multiline
                    rows={10}
                    value={state.input}
                    onChange={(evt) => state.input = evt.target.value as string}
                />

                <ErrorMessage state={state} />
                
            </DialogContent>

            <DialogActions>
                <Button onClick={() => state.dialogOpen = false} color={PrimaryButtonColor}>
                    Cancel
                </Button>
                <Button onClick={() => state.startNewInstance()} disabled={!state.orchestratorFunctionName} color="secondary">
                    Start
                </Button>
            </DialogActions>
                
       </Dialog>);
    }
}