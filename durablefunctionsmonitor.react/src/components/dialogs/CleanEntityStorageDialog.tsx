// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Checkbox, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControl,
    FormControlLabel, FormGroup, LinearProgress, 
} from '@material-ui/core';

import './CleanEntityStorageDialog.css';

import { ErrorMessage } from '../ErrorMessage';
import { CleanEntityStorageDialogState } from '../../states/dialogs/CleanEntityStorageDialogState';

import { PrimaryButtonColor } from '../../theme';

// Dialog with parameters for cleaning entity storage
@observer
export class CleanEntityStorageDialog extends React.Component<{ state: CleanEntityStorageDialogState }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (
            <Dialog open={state.dialogOpen} onClose={() => { if (!state.inProgress) state.dialogOpen = false; }}>

                <DialogTitle>Clean Entity Storage</DialogTitle>

                {!state.response && (<>
                    <DialogContent>

                        {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                        <DialogContentText>
                            An entity is considered empty, and is removed, if it has no state, is not locked, and has been idle for more than <strong>EntityMessageReorderWindowInMinutes</strong>. Locks are considered orphaned, and are released, if the orchestration that holds them is not in <strong>Running</strong> state.
                        </DialogContentText>

                        <FormControl className="purge-history-statuses" disabled={state.inProgress}>
                            <FormGroup row>

                                <FormControlLabel control={<Checkbox
                                    checked={state.removeEmptyEntities}
                                    onChange={(evt) => state.removeEmptyEntities = evt.target.checked} />}
                                    label="Remove Empty Entities"
                                />

                                <FormControlLabel control={<Checkbox
                                    checked={state.releaseOrphanedLocks}
                                    onChange={(evt) => state.releaseOrphanedLocks = evt.target.checked} />}
                                    label="Release Orphaned Locks"
                                />
                                
                            </FormGroup>
                        </FormControl>

                        <ErrorMessage state={state} />

                    </DialogContent>

                    <DialogActions>
                        <Button onClick={() => state.dialogOpen = false} disabled={state.inProgress} color={PrimaryButtonColor}>
                            Cancel
                        </Button>
                        <Button onClick={() => state.clean()} disabled={!state.isValid || state.inProgress} color="secondary">
                            Clean
                        </Button>
                    </DialogActions>
                </>)}

                {!!state.response && (<>
                    <DialogContent>
                        <DialogContentText className="success-message">
                            {state.response.numberOfEmptyEntitiesRemoved} empty entities removed. 
                        </DialogContentText>
                        <DialogContentText className="success-message">
                            {state.response.numberOfOrphanedLocksRemoved} orphaned locks removed.
                        </DialogContentText>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => state.dialogOpen = false} color={PrimaryButtonColor}>
                            Close
                        </Button>
                    </DialogActions>
                </>)}

            </Dialog>
        );
    }
}