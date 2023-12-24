// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import { Grid, Link, TextField } from '@mui/material';

import { RuntimeStatusToStyle } from '../../theme';
import { LongJsonDialog } from '../dialogs/LongJsonDialog';
import { DfmContextType } from '../../DfmContext';
import { OrchestrationDetailsState } from 'src/states/details-view/OrchestrationDetailsState';
import { Theme } from '../../theme';

// Fields for detailed durable entity view
@observer
export class DurableEntityFields extends React.Component<{ state: OrchestrationDetailsState }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    render(): JSX.Element {

        const state = this.props.state;
        const details = state.details;

        const runtimeStatusStyle = RuntimeStatusToStyle(details.runtimeStatus);

        const inputFieldValue = LongJsonDialog.convertLongField(details.input);
        const customStatusFieldValue = LongJsonDialog.convertLongField(details.customStatus);

        return (<>
            <Grid container className="grid-container">
                <Grid item xs={12} sm={12} md={3} zeroMinWidth className="grid-item">
                    <TextField
                        label="entityId.name"
                        value={details.entityId?.name}
                        margin="normal"
                        InputProps={{ readOnly: true }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                    />
                </Grid>

                <Grid item xs={12} sm={6} md={3} zeroMinWidth className="grid-item">
                    <TextField
                        label="entityId.key"
                        value={details.entityId?.key}
                        margin="normal"
                        InputProps={{ readOnly: true }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                    />
                </Grid>

                <Grid item xs={12} sm={6} md={2} zeroMinWidth className="grid-item">
                    <TextField
                        label={`createdTime (${this.context.timeZoneName})`}
                        value={this.context.formatDateTimeString(details.createdTime)}
                        margin="normal"
                        InputProps={{ readOnly: true }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2} zeroMinWidth className="grid-item">
                    <TextField
                        label={`lastUpdatedTime (${this.context.timeZoneName})`}
                        value={this.context.formatDateTimeString(details.lastUpdatedTime)}
                        margin="normal"
                        InputProps={{ readOnly: true }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2} zeroMinWidth className="grid-item">
                    <TextField
                        label="runtimeStatus"
                        value={details.runtimeStatus}
                        margin="normal"
                        InputProps={{ readOnly: true }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                        style={runtimeStatusStyle}
                    />
                </Grid>
                
                <Grid item xs={12} zeroMinWidth className="grid-item">
                    <TextField
                        label="input"
                        value={inputFieldValue.value}
                        margin="normal"
                        InputProps={{
                            readOnly: true,
                            inputComponent: !inputFieldValue.isUrl ? undefined :
                                () => <Link className="link-with-pointer-cursor" 
                                    color={Theme.palette.mode === 'dark' ? 'inherit' : 'primary'} 
                                    onClick={() => state.downloadFieldValue('input')}
                                >
                                    {inputFieldValue.value}
                                </Link>
                        }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                        multiline
                        maxRows={10}
                    />
                </Grid>
                <Grid item xs={12} zeroMinWidth className="grid-item">
                    <TextField
                        label="customStatus"
                        value={customStatusFieldValue.value}
                        margin="normal"
                        InputProps={{
                            readOnly: true,
                            inputComponent: !customStatusFieldValue.isUrl ? undefined :
                                () => <Link className="link-with-pointer-cursor" 
                                    color={Theme.palette.mode === 'dark' ? 'inherit' : 'primary'} 
                                    onClick={() => state.downloadFieldValue('custom-status')}
                                >
                                    {customStatusFieldValue.value}
                                </Link>
                        }}
                        InputLabelProps={{ shrink: true }}
                        variant="outlined"
                        fullWidth
                        multiline
                        maxRows={10}
                    />
                </Grid>
            </Grid>

        </>);
    }
}