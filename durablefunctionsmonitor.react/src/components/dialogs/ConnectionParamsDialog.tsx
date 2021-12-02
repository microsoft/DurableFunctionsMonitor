// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, LinearProgress, TextField
} from '@material-ui/core';

import { ErrorMessage } from '../ErrorMessage';
import { ConnectionParamsDialogState } from '../../states/dialogs/ConnectionParamsDialogState';

import { PrimaryButtonColor } from '../../theme';

// Dialog for showing connection string and task hub name
@observer
export class ConnectionParamsDialog extends React.Component<{ state: ConnectionParamsDialogState }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (<Dialog open={state.dialogOpen} onClose={() => state.dialogOpen = false}>
            
            <DialogTitle>Manage Storage Connection Settings</DialogTitle>
            <DialogContent>

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}
                
                <DialogContentText>
                    {
                        state.isReadonly ?
                            "Change the below values via your application settings ('DFM_HUB_NAME' and 'AzureWebJobsStorage' respectively)" :
                            "The below values will be saved to local.settings.json file."
                    }
                </DialogContentText>

                <TextField
                    className="dialog-text-field"
                    autoFocus
                    margin="dense"
                    label="Hub Name"
                    fullWidth
                    disabled={state.inProgress}
                    InputProps={{ readOnly: true }}
                    InputLabelProps={{ shrink: true }}
                    value={state.hubName}
                    onChange={(evt) => state.hubName = evt.target.value as string}
                />

                <TextField
                    autoFocus
                    margin="dense"
                    label="Azure Storage Connection String"
                    fullWidth
                    disabled={state.inProgress}
                    InputProps={{ readOnly: state.isReadonly }}
                    InputLabelProps={{ shrink: true }}
                    value={state.connectionString}
                    onChange={(evt) => state.connectionString = evt.target.value as string}
                />

                <ErrorMessage state={state}/>

            </DialogContent>
            <DialogActions>
                <Button onClick={() => state.dialogOpen = false} color={PrimaryButtonColor}>
                    Cancel
                </Button>

                {(!state.isReadonly) && (
                    <Button
                        onClick={() => state.saveConnectionParams()}
                        disabled={!state.isDirty || !state.hubName || !state.connectionString || state.inProgress}
                        color="secondary"
                    >
                        Save
                    </Button>
                )}

            </DialogActions>
                
       </Dialog>);
    }
}