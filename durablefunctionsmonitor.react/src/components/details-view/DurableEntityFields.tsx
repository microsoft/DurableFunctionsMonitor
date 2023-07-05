// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import { Grid, TextField } from '@mui/material';

import { DurableOrchestrationStatus } from '../../states/DurableOrchestrationStatus';
import { RuntimeStatusToStyle } from '../../theme';
import { LongJsonDialog } from '../dialogs/LongJsonDialog';
import { DfmContextType } from '../../DfmContext';

// Fields for detailed durable entity view
@observer
export class DurableEntityFields extends React.Component<{ details: DurableOrchestrationStatus }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    render(): JSX.Element {
        const details = this.props.details;

        const runtimeStatusStyle = RuntimeStatusToStyle(details.runtimeStatus);

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
                        value={LongJsonDialog.formatJson(details.input)}
                        margin="normal"
                        InputProps={{ readOnly: true }}
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
                        value={LongJsonDialog.formatJson(details.customStatus)}
                        margin="normal"
                        InputProps={{ readOnly: true }}
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