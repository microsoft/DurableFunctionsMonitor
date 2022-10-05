// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    FormHelperText, IconButton, InputAdornment, Link, Paper, Table, TableBody, TableCell, TableHead, TableRow,
    TableSortLabel, TextField, Typography
} from '@material-ui/core';

import CloseIcon from '@material-ui/icons/Close';

import { IBackendClient } from '../../services/IBackendClient';
import { DurableOrchestrationStatusFields } from '../../states/DurableOrchestrationStatus';
import { OrchestrationLink } from '../OrchestrationLink';
import { ResultsListTabState } from '../../states/results-view/ResultsListTabState';
import { DfmContextType } from '../../DfmContext';
import { RuntimeStatusToStyle } from '../../theme';
import { DateTimeHelpers } from '../../DateTimeHelpers';
import { LongJsonDialog } from '../dialogs/LongJsonDialog';
import { Theme } from '../../theme';
import { FunnelIcon } from './FunnelIcon';
import { renderFilteredField } from '../RenderHelpers';

// Orchestrations list view
@observer
export class OrchestrationsList extends React.Component<{ state: ResultsListTabState, filteredOutColumns: string[], backendClient: IBackendClient }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    render(): JSX.Element {

        const state = this.props.state;

        return (<>
            
            <FormHelperText className="items-count-label">
                    
                {state.orchestrations.length} items shown
            
                {!!state.hiddenColumns.length && (<>

                    , {state.hiddenColumns.length} columns hidden

                    (<Link
                        color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} 
                        className="unhide-button"
                        component="button"
                        variant="inherit"
                        onClick={() => state.unhide()}
                    >
                        unhide
                    </Link>)

                </>)}

                {!!state.orderBy && (<>

                    , sorted by <strong>{state.orderBy} {state.orderByDirection}</strong>
                    
                    (<Link
                        color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} 
                        className="unhide-button"
                        component="button"
                        variant="inherit"
                        onClick={() => state.resetOrderBy()}
                    >
                        reset
                    </Link>)

                </>)}

                {!!state.clientFilteredColumn && (<>

                    , filter <strong>{state.clientFilteredColumn}</strong> with:
                    
                    <TextField
                        
                        className='column-filter-input'
                        autoFocus
                        hiddenLabel
                        variant='outlined'
                        size='small'
                        value={state.clientFilterValue}
                        onChange={(evt) => state.clientFilterValue = evt.target.value as string}
                        onKeyDown={(evt) => {

                            if (evt.key === 'Enter') {
                                // Otherwise the event will bubble up and the form will be submitted
                                evt.preventDefault();
                    
                                state.applyFilter();

                            } else if (evt.key === 'Escape') {
                                
                                state.resetFilter();
                            }
                        }}
                        onBlur={(evt) => {

                            // this check is needed, because otherwise .applyFilter() will overshadow the CloseButton's click
                            if (!evt.relatedTarget) {
                                
                                state.applyFilter();
                            }
                        }}
                        
                        InputProps={{
                            endAdornment: <InputAdornment position="end">

                                <IconButton
                                    color="inherit"
                                    size="small"
                                    onClick={() => state.resetFilter()}
                                >
                                    <CloseIcon />
                                </IconButton>

                            </InputAdornment>,
                        }}
                    />
                </>)}
                    
            </FormHelperText>

            <Paper elevation={0}>
                {this.renderTable(state)}
            </Paper>

            <LongJsonDialog state={state.longJsonDialogState} />
            
        </>);
    }

    private renderTable(state: ResultsListTabState): JSX.Element {

        if (!state.orchestrations.length) {
            return (
                <Typography variant="h5" className="empty-table-placeholder" >
                    This list is empty
                </Typography>
            );
        }

        // Hidden columns is a combination of columns hidden by the user and columns being not shown due to the current filter (e.g. 'lastEvent' column is only shown when is being filtered on)
        const hiddenColumns = this.props.filteredOutColumns.concat(state.hiddenColumns);

        const visibleColumns = DurableOrchestrationStatusFields
            .filter(col => !hiddenColumns.includes(col));
        
        return (
            <Table size="small">
                <TableHead>
                    <TableRow>
                        {visibleColumns.map(col => (

                            <TableCell key={col}
                                onMouseEnter={() => state.columnUnderMouse = col}
                                onMouseLeave={() => state.columnUnderMouse = ''}
                                className="instances-list-header-cell"
                            >
                                <TableSortLabel
                                    active={state.orderBy === col}
                                    direction={state.orderByDirection}
                                    onClick={() => state.orderBy = col}
                                >
                                    {col}

                                    {['createdTime', 'lastUpdatedTime'].includes(col) && (<span className="time-zone-name-span">({this.context.timeZoneName})</span>)}

                                </TableSortLabel>

                                {state.columnUnderMouse === col && (<>
                                    
                                    <IconButton
                                        color="inherit"
                                        size="small"
                                        className="column-filter-button"
                                        onClick={() => state.setClientFilteredColumn(col)}
                                    >
                                        <FunnelIcon/>
                                    </IconButton>

                                    {(visibleColumns.length > 1) && (
                                        <IconButton
                                            color="inherit"
                                            size="small"
                                            className="column-hide-button"
                                            onClick={() => state.hideColumn(col)}
                                        >
                                            <CloseIcon className="columnt-filter-button-img" />
                                        </IconButton>
                                    )}

                                </>)}

                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {state.orchestrations.map(orchestration => {

                        const rowStyle = RuntimeStatusToStyle(orchestration.runtimeStatus);
                        const cellStyle = { verticalAlign: 'top' };
                        return (
                            <TableRow
                                key={orchestration.instanceId}
                                style={rowStyle}
                            >
                                {visibleColumns.includes('instanceId') && (
                                    <TableCell className="instance-id-cell" style={cellStyle}>
                                        <OrchestrationLink
                                            orchestrationId={orchestration.instanceId}
                                            backendClient={this.props.backendClient}
                                            filterValue={state.clientFilteredColumn === 'instanceId' ? state.clientFilterValue : ''}
                                        />
                                    </TableCell>
                                )}
                                {visibleColumns.includes('parentInstanceId') && (
                                    <TableCell className="instance-id-cell" style={cellStyle}>
                                        <OrchestrationLink
                                            orchestrationId={orchestration.parentInstanceId}
                                            backendClient={this.props.backendClient}
                                            filterValue={state.clientFilteredColumn === 'parentInstanceId' ? state.clientFilterValue : ''}
                                        />
                                    </TableCell>
                                )}
                                {visibleColumns.includes('name') && (
                                    <TableCell className="name-cell" style={cellStyle}>
                                        {renderFilteredField(orchestration.name,
                                            state.clientFilteredColumn === 'name' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('createdTime') && (
                                    <TableCell className="datetime-cell" style={cellStyle}>
                                        {renderFilteredField(this.context.formatDateTimeString(orchestration.createdTime),
                                            state.clientFilteredColumn === 'createdTime' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('lastUpdatedTime') && (
                                    <TableCell className="datetime-cell" style={cellStyle}>
                                        {renderFilteredField(this.context.formatDateTimeString(orchestration.lastUpdatedTime),
                                            state.clientFilteredColumn === 'lastUpdatedTime' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('duration') && (
                                    <TableCell style={cellStyle}>
                                        {renderFilteredField(DateTimeHelpers.formatDuration(orchestration.duration),
                                            state.clientFilteredColumn === 'duration' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('runtimeStatus') && (
                                    <TableCell style={cellStyle}>
                                        {renderFilteredField(orchestration.runtimeStatus,
                                            state.clientFilteredColumn === 'runtimeStatus' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('lastEvent') && (
                                    <TableCell style={cellStyle}>
                                        {renderFilteredField(orchestration.lastEvent,
                                            state.clientFilteredColumn === 'lastEvent' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('input') && (
                                    <TableCell className="output-cell" style={cellStyle}>
                                        {LongJsonDialog.renderJson(orchestration.input, `${orchestration.instanceId} / input`,
                                            state.longJsonDialogState, state.clientFilteredColumn === 'input' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('output') && (
                                    <TableCell className="output-cell" style={cellStyle}>
                                        {LongJsonDialog.renderJson(orchestration.output, `${orchestration.instanceId} / output`,
                                            state.longJsonDialogState, state.clientFilteredColumn === 'output' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                                {visibleColumns.includes('customStatus') && (
                                    <TableCell className="output-cell" style={cellStyle}>
                                        {LongJsonDialog.renderJson(orchestration.customStatus, `${orchestration.instanceId} / customStatus`,
                                            state.longJsonDialogState, state.clientFilteredColumn === 'customStatus' ? state.clientFilterValue : '')}
                                    </TableCell>
                                )}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        );
    }
}