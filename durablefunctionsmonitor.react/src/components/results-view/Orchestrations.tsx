// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { action } from 'mobx'
import { observer } from 'mobx-react';

import {
    AppBar, Box, Button, Checkbox, FormGroup, FormControl, Grid,
    InputLabel, LinearProgress, ListItemText, Menu, MenuItem, Select, Tab, Tabs, TextField, Toolbar, Typography
} from '@material-ui/core';

import { KeyboardDateTimePicker } from '@material-ui/pickers';

import RefreshIcon from '@material-ui/icons/Refresh';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import CheckIcon from '@material-ui/icons/Check';

import './Orchestrations.css';

import { DurableOrchestrationStatusFields, RuntimeStatuses } from '../../states/DurableOrchestrationStatus';
import { ErrorMessage } from '../ErrorMessage';
import { OrchestrationsState, ResultsTabEnum, TimeRangeEnum } from '../../states/results-view/OrchestrationsState';
import { FilterOperatorEnum } from '../../states/FilterOperatorEnum';
import { ResultsListTabState } from '../../states/results-view/ResultsListTabState';
import { ResultsGanttDiagramTabState } from '../../states/results-view/ResultsGanttDiagramTabState';
import { ResultsHistogramTabState } from '../../states/results-view/ResultsHistogramTabState';
import { ResultsFunctionGraphTabState } from '../../states/results-view/ResultsFunctionGraphTabState';
import { OrchestrationsList } from './OrchestrationsList';
import { OrchestrationsHistogram } from './OrchestrationsHistogram';
import { OrchestrationsGanttChart } from './OrchestrationsGanttChart';
import { OrchestrationsFunctionGraph } from './OrchestrationsFunctionGraph';
import { DfmContextType } from '../../DfmContext';

// Orchestrations view
@observer
export class Orchestrations extends React.Component<{ state: OrchestrationsState }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    componentDidMount() {

        // Triggering initial load
        this.props.state.loadOrchestrations();

        // Doing a simple infinite scroll
        document.addEventListener('scroll', (evt) => {

            const state = this.props.state;

            if (state.tabIndex !== ResultsTabEnum.List ) {
                return;
            }

            const scrollingElement = (evt.target as Document).scrollingElement;
            if (!scrollingElement) { 
                return;
            }

            const scrollPos = scrollingElement.scrollHeight - window.innerHeight - scrollingElement.scrollTop;
            const scrollPosThreshold = 100;

            if (scrollPos < scrollPosThreshold) {
                state.loadOrchestrations();
            }
        });

        // Doing zoom reset
        document.addEventListener('keydown', (evt: any) => {

            const state = this.props.state;
            if (state.tabIndex === ResultsTabEnum.Histogram && !!evt.ctrlKey && evt.keyCode === 90) {

                const histogramState = state.selectedTabState as ResultsHistogramTabState;
                histogramState.resetZoom();
            }
        });
    }

    render(): JSX.Element {

        const state = this.props.state;
        const listState = state.selectedTabState as ResultsListTabState;
        const histogramState = state.selectedTabState as ResultsHistogramTabState;
        const ganttChartState = state.selectedTabState as ResultsGanttDiagramTabState;
        const functionGraphState = state.selectedTabState as ResultsFunctionGraphTabState;

        const allStatuses = '[Show All]';

        return (<>

            <Menu
                anchorEl={state.menuAnchorElement}
                keepMounted
                open={!!state.menuAnchorElement}
                onClose={() => state.menuAnchorElement = undefined}
            >
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.LastMinute}>Last Minute</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Last10Minutes}>Last 10 Minutes</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.LastHour}>Last Hour</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Last24Hours}>Last 24 Hours</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Last7Days}>Last 7 Days</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Last30Days}>Last 30 Days</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Last90Days}>Last 90 Days</MenuItem>
                <MenuItem onClick={() => state.timeRange = TimeRangeEnum.Custom}>Custom</MenuItem>
            </Menu>
            
            <AppBar color="inherit" position="static" className="top-appbar">

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                <Toolbar variant="dense" className="top-toolbar">

                    <Grid container className="toolbar-grid1">
                        <Grid item xs={12}>

                            <Button size="small" variant="outlined" className="time-period-menu-drop-btn"
                                onClick={evt => state.menuAnchorElement = evt.currentTarget}
                            >
                                <ArrowDropDownIcon/>
                            </Button>
                            
                            {!!state.timeRange ? (
                                <TextField
                                    className="from-input"
                                    label="Time Range (createdTime)"
                                    InputProps={{ readOnly: true }}
                                    InputLabelProps={{ shrink: true }}
                                    type="text"
                                    value={this.timeRangeToString(state.timeRange)}
                                />
                            ) : (
                                <KeyboardDateTimePicker
                                    className="from-input"
                                    ampm={false}
                                    autoOk={true}
                                    label={`From (${this.context.timeZoneName})`}
                                    invalidDateMessage=""
                                    format={"YYYY-MM-DD HH:mm:ss"}
                                    disabled={state.inProgress}
                                    value={this.context.getMoment(state.timeFrom)}
                                    onChange={(t) => state.timeFrom = this.context.setMoment(t)}
                                    onBlur={() => state.applyTimeFrom()}
                                    onAccept={() => state.applyTimeFrom()}
                                    onKeyPress={this.handleKeyPress}
                                />
                            )}

                        </Grid>
                        <Grid item xs={12} className="toolbar-grid1-item2">

                            {!state.timeRange && (<>

                                <FormControl>
                                    <Checkbox
                                        id="till-checkbox"
                                        className="till-checkbox"
                                        disabled={state.inProgress}
                                        checked={state.timeTillEnabled}
                                        onChange={(evt) => state.timeTillEnabled = evt.target.checked}
                                    />
                                </FormControl>

                                {state.timeTillEnabled ? (
                                    <KeyboardDateTimePicker
                                        className="till-input"
                                        ampm={false}
                                        autoOk={true}
                                        label={`Till (${this.context.timeZoneName})`}
                                        invalidDateMessage=""
                                        format={"YYYY-MM-DD HH:mm:ss"}
                                        disabled={state.inProgress}
                                        value={this.context.getMoment(state.timeTill)}
                                        onChange={(t) => state.timeTill = this.context.setMoment(t)}
                                        onBlur={() => state.applyTimeTill()}
                                        onAccept={() => state.applyTimeTill()}
                                        onKeyPress={this.handleKeyPress}
                                    />
                                ) : (
                                    <TextField
                                        className="till-input"
                                        label={`Till (${this.context.timeZoneName})`}
                                        placeholder="[Now]"
                                        InputLabelProps={{ shrink: true }}
                                        type="text"
                                        disabled={true}
                                    />
                                )}

                            </>)}
                            
                        </Grid>
                    </Grid>

                    <Grid container className="toolbar-grid2">
                        <Grid item xs={12} className="toolbar-grid2-item-1">

                            <FormControl>
                                <InputLabel htmlFor="filtered-column-select">Filtered Column</InputLabel>
                                <Select
                                    className="toolbar-select filtered-column-input"
                                    disabled={state.inProgress}
                                    value={state.filteredColumn}
                                    onChange={(evt) => state.filteredColumn = evt.target.value as string}
                                    inputProps={{ id: "filtered-column-select" }}>

                                    <MenuItem value="0">[Not Selected]</MenuItem>
                                    {DurableOrchestrationStatusFields.map(col => {
                                        return (<MenuItem key={col} value={col}>{col}</MenuItem>);
                                    })}

                                </Select>
                            </FormControl>

                            <FormControl className="toolbar-grid2-item1-select">

                                <InputLabel htmlFor="filter-operator-select">Filter Operator</InputLabel>
                                <Select
                                    className="toolbar-select"
                                    disabled={state.inProgress}
                                    value={state.filterOperator}
                                    onChange={(evt) => state.filterOperator = evt.target.value as number}
                                    inputProps={{ id: "filter-operator-select" }}
                                >
                                    <MenuItem value={FilterOperatorEnum.Equals}>Equals</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.StartsWith}>Starts With</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.Contains}>Contains</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.In}>In</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.NotEquals}>Not Equals</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.NotStartsWith}>Not Starts With</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.NotContains}>Not Contains</MenuItem>
                                    <MenuItem value={FilterOperatorEnum.NotIn}>Not In</MenuItem>
                                </Select>

                            </FormControl>

                            <TextField
                                fullWidth
                                className="filter-value-input"
                                label="Filter Value"
                                InputLabelProps={{ shrink: true }}
                                placeholder={[FilterOperatorEnum.In, FilterOperatorEnum.NotIn].includes(state.filterOperator) ? `[comma-separated or JSON array]` : `[some text or 'null']`}
                                disabled={state.filteredColumn === '0' || state.inProgress}
                                value={state.filterValue}
                                onChange={(evt) => state.filterValue = evt.target.value as string}
                                onBlur={() => state.applyFilterValue()}
                                onKeyPress={this.handleKeyPress}
                            />

                        </Grid>

                        <Grid item xs={12} className="toolbar-grid2-item2">

                            <FormGroup className="toolbar-runtime-status-checkbox-group">

                                <InputLabel shrink={true}>Type/Status {!state.showStatuses ? '' : ` (${state.showStatuses.length} selected)`}</InputLabel>

                                <Select
                                    multiple
                                    autoWidth
                                    className="toolbar-select"
                                    disabled={state.inProgress}
                                    value={state.showStatuses ?? [allStatuses]}
                                    
                                    onChange={(evt) => {

                                        var newStatuses = (evt.target.value as any);

                                        if (!!state.showStatuses && newStatuses.includes(allStatuses)) {

                                            state.showStatuses = null;

                                        } else {

                                            newStatuses = newStatuses.filter(s => !!s && s !== allStatuses);
                                            state.showStatuses = !newStatuses.length ? null : newStatuses;
                                        }
                                    }}

                                    open={state.isStatusSelectOpen}
                                    onClose={() => {
                                        state.isStatusSelectOpen = false;
                                    }}
                                    onOpen={(evt) => {
                                        state.isStatusSelectOpen = true;
                                    }}
                                    
                                    renderValue={(statuses: any) => {

                                        const result = [];

                                        const orchestrationStatuses = statuses.filter(s => s !== allStatuses && s !== 'DurableEntities');
                                        if (!!orchestrationStatuses.length) {
                                            result.push('Orchestrations: ' + orchestrationStatuses.join(', '));
                                        }

                                        if (statuses.includes('DurableEntities')) {
                                            result.push('Durable Entities');
                                        }

                                        return !result.length ? allStatuses : result.join('; ');
                                    }}
                                >
                                   
                                    <MenuItem key={allStatuses} value={allStatuses}>
                                        <Checkbox checked={!state.showStatuses} />
                                        <ListItemText primary={allStatuses} />
                                    </MenuItem>
                                        
                                    {RuntimeStatuses.map(status => (
                                        <MenuItem key={status} value={status}>
                                            <Checkbox checked={!!state.showStatuses && !!state.showStatuses.includes(status)} />
                                            <ListItemText primary={'Orchestrations: ' + status} />
                                        </MenuItem>
                                    ))}
                                        
                                    <MenuItem key="DurableEntities" value="DurableEntities">

                                    <Checkbox checked={!!state.showStatuses && !!state.showStatuses.includes('DurableEntities')} />
                                        <ListItemText primary="Durable Entities" />
                                    </MenuItem>

                                    <MenuItem onClick={(evt) => {
                                        state.isStatusSelectOpen = false;
                                    }}>
                                        <Button variant="outlined" fullWidth>
                                            <CheckIcon/>
                                            <Box width={5} />
                                            OK
                                        </Button>
                                    </MenuItem>
                                    
                                </Select>
                            </FormGroup>

                        </Grid>
                    </Grid>

                    <Grid container className="toolbar-grid3">
                        <Grid item xs={12}>
                            <FormControl className="form-control-float-right">
                                <InputLabel htmlFor="auto-refresh-select">Auto-refresh</InputLabel>
                                <Select
                                    className="autorefresh-select"
                                    inputProps={{ id: "auto-refresh-select" }}
                                    value={state.autoRefresh}
                                    onChange={(evt) => state.autoRefresh = evt.target.value as number}
                                >
                                    <MenuItem value={0}>Never</MenuItem>
                                    <MenuItem value={1}>Every 1 sec.</MenuItem>
                                    <MenuItem value={5}>Every 5 sec.</MenuItem>
                                    <MenuItem value={10}>Every 10 sec.</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} className="toolbar-grid3-item2">
                            <Button
                                className="refresh-button form-control-float-right"
                                variant="outlined"
                                color="default"
                                size="large"
                                onClick={() => state.inProgress ? state.cancel() : state.reloadOrchestrations()}
                            >
                                {state.inProgress ? (<CancelOutlinedIcon />) : (<RefreshIcon />)}
                            </Button>
                        </Grid>
                    </Grid>

                </Toolbar>
            </AppBar>

            <AppBar color="inherit" position="static">
                <Tabs className="tab-buttons" value={state.tabIndex} onChange={(ev: React.ChangeEvent<{}>, val) => state.tabIndex = val}>

                    <Tab className="tab-buttons" disabled={state.inProgress} label={<Typography color="textPrimary" variant="subtitle2">List</Typography>} />
                    <Tab className="tab-buttons" disabled={state.inProgress} label={<Typography color="textPrimary" variant="subtitle2">Time Histogram</Typography>} />
                    <Tab className="tab-buttons" disabled={state.inProgress} label={<Typography color="textPrimary" variant="subtitle2">Gantt Chart</Typography>} />

                    {!!state.isFunctionGraphAvailable && (
                        <Tab className="tab-buttons" disabled={state.inProgress} label={<Typography color="textPrimary" variant="subtitle2">Functions Graph</Typography>} />
                    )}
                    
                </Tabs>
            </AppBar>

            {state.tabIndex === ResultsTabEnum.List && (<>

                <OrchestrationsList state={listState} filteredOutColumns={state.filteredOutColumns} backendClient={state.backendClient} />

                {state.inProgress && !!listState.orchestrations.length ? (<LinearProgress />) : (<Box height={4} />)}
                
            </>)}

            {state.tabIndex === ResultsTabEnum.Histogram &&
                (<OrchestrationsHistogram state={histogramState} />)
            }
            
            {state.tabIndex === ResultsTabEnum.Gantt &&
                (<OrchestrationsGanttChart
                    state={ganttChartState}
                    inProgress={state.inProgress}
                    fileName={`gantt-chart-${state.timeFrom.format('YYYY-MM-DD-HH-mm-ss')}-${state.timeTill.format('YYYY-MM-DD-HH-mm-ss')}`} 
                    backendClient={state.backendClient} 
                />)
            }

            {state.tabIndex === ResultsTabEnum.FunctionGraph &&
                (<OrchestrationsFunctionGraph
                    state={functionGraphState}
                    inProgress={state.inProgress}
                    fileName={`function-graph-${state.timeFrom.format('YYYY-MM-DD-HH-mm-ss')}-${state.timeTill.format('YYYY-MM-DD-HH-mm-ss')}`} 
                    backendClient={state.backendClient} 
                />)
            }
                
            <Toolbar variant="dense" />
            
            <ErrorMessage state={this.props.state} />
            
        </>);
    }

    private timeRangeToString(timeRange: TimeRangeEnum): string {
        switch (timeRange) {
            case TimeRangeEnum.LastMinute: return 'Last Minute';
            case TimeRangeEnum.Last10Minutes: return 'Last 10 Minutes';
            case TimeRangeEnum.LastHour: return 'Last Hour';
            case TimeRangeEnum.Last24Hours: return 'Last 24 Hours';
            case TimeRangeEnum.Last7Days: return 'Last 7 Days';
            case TimeRangeEnum.Last30Days: return 'Last 30 Days';
            case TimeRangeEnum.Last90Days: return 'Last 90 Days';
            default: return '';
        }
    }

    @action.bound
    private handleKeyPress(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter') {
            // Otherwise the event will bubble up and the form will be submitted
            event.preventDefault();

            this.props.state.reloadOrchestrations();
        }
    }
}