// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import './BatchOpsDialog.css';

import {
    Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, LinearProgress, MenuItem, Select, Table, TableBody, TableCell, TableHead, TableRow, TextField,
    Typography
} from '@mui/material';

import { ErrorMessage } from '../ErrorMessage';
import { BatchOperations, BatchOpsDialogState } from '../../states/dialogs/BatchOpsDialogState';

import { PrimaryButtonColor, RuntimeStatusToStyle } from '../../theme';

// Dialog for executing batch operations
@observer
export class BatchOpsDialog extends React.Component<{ state: BatchOpsDialogState }> {

    render(): JSX.Element {

        const state = this.props.state;

        return (<Dialog fullWidth={true} maxWidth="lg" open={state.dialogOpen} onClose={() => { if ((!state.inProgress) || (!state.instances?.length)) state.dialogOpen = false; }}>
            
            <DialogTitle>Execute {state.operation === `[Select]` ? `a batch`: `'${state.operation}'`} operation for the following {state.instances.length} instances</DialogTitle>

            <DialogContent>

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                <Box height={5} />
                
                <FormControl className="batch-operation-select">
                    <InputLabel variant="standard">Operation to execute</InputLabel>
                    <Select
                        variant="standard"
                        disabled={state.inProgress}
                        value={state.operation}
                        onChange={(evt) => state.operation = evt.target.value as any}
                    >
                        {BatchOperations.map(op => (
                            <MenuItem value={op}>{op}</MenuItem>
                        ))}
                    </Select>
                </FormControl>

                {state.stringInputTitle && (

                    <TextField
                        className="batch-operation-string-input"
                        variant="standard"
                        disabled={state.inProgress}
                        InputLabelProps={{ shrink: true }}
                        label={state.stringInputTitle}
                        value={state.stringInput}
                        onChange={(evt) => state.stringInput = evt.target.value as string}
                    />
                )}

                {state.boolInputTitle && (

                    <FormControlLabel className="batch-operation-bool-input" control={<Checkbox
                        checked={state.boolInput}
                        onChange={(evt) => state.boolInput = evt.target.checked} />}
                        label={state.boolInputTitle}
                    />
                )}

                {state.jsonInputTitle && (<>

                    <TextField
                        className="batch-operation-json-input"
                        margin="dense"
                        disabled={state.inProgress}
                        InputLabelProps={{ shrink: true }}
                        label={state.jsonInputTitle}
                        fullWidth
                        multiline
                        rows={2}
                        value={state.jsonInput}
                        onChange={(evt) => state.jsonInput = evt.target.value as string}
                    />
                    
                </>)}

                {!state.instances?.length ? (
                
                    <Typography variant="h5" className="empty-table-placeholder" >
                        No instances selected
                    </Typography>
                ): (
                        
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>instanceId</TableCell>
                                <TableCell>name</TableCell>
                                <TableCell>execution status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>

                            {state.instances.map(i => {

                                const rowStyle = RuntimeStatusToStyle(i.status);

                                return (
                                    <TableRow style={rowStyle}>
                                        <TableCell className="batch-operation-instance-cell">{i.id}</TableCell>
                                        <TableCell className="batch-operation-instance-cell">{i.name}</TableCell>
                                        <TableCell>
                                            {i.statusText?.length > 50 ? (<div className="batch-operation-status-cell-input"> {i.statusText} </div>) : (i.statusText)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}

                        </TableBody>
                    </Table>
                )}
                
                <ErrorMessage state={state} />
                
            </DialogContent>

            <DialogActions>

                <Button onClick={() => state.execute()} disabled={(!state.instances?.length) || (state.operation === '[Select]') || (!!state.inProgress)} color="secondary">
                    Execute
                </Button>

                <Button onClick={() => state.dialogOpen = false} disabled={(!!state.inProgress) && (!!state.instances?.length)} color={PrimaryButtonColor}>
                    Close
                </Button>

            </DialogActions>
                
       </Dialog>);
    }
}