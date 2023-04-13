// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    AppBar, Box, Button, FormControl, InputLabel, LinearProgress, MenuItem,
    Select, Tabs, Tab, Toolbar, Typography
} from '@material-ui/core';

import RefreshIcon from '@material-ui/icons/Refresh';
import CancelOutlinedIcon from '@material-ui/icons/CancelOutlined';
import FileCopyIcon from '@material-ui/icons/FileCopy';

import './OrchestrationDetails.css';

import { DurableEntityButtons } from './DurableEntityButtons';
import { DurableEntityFields } from './DurableEntityFields';
import { ErrorMessage } from '../ErrorMessage';
import { OrchestrationButtons } from './OrchestrationButtons';
import { OrchestrationDetailsState } from '../../states/details-view/OrchestrationDetailsState';
import { FunctionGraphTabState } from '../../states/details-view/FunctionGraphTabState';
import { CustomTabTypeEnum } from '../../states/details-view/ICustomTabState';
import { OrchestrationFields } from './OrchestrationFields';
import { CustomTabStyle } from '../../theme';
import { SaveAsSvgButton, getStyledSvg } from '../SaveAsSvgButton';
import { OrchestrationDetailsFunctionGraph } from './OrchestrationDetailsFunctionGraph';
import { DfmContextType } from '../../DfmContext';

// Orchestration Details view
@observer
export class OrchestrationDetails extends React.Component<{ state: OrchestrationDetailsState }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    componentDidMount() {

        // Triggering initial load
        this.props.state.loadDetails();
    }

    componentDidUpdate() {

        // Mounting click handlers to diagram nodes
        const svgElement = document.getElementById('mermaidSvgId');

        if (!!svgElement) {

            for (const className of ['actor', 'messageText', 'task', 'taskText', 'taskTextOutsideLeft', 'taskTextOutsideRight']) {
                this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName(className));
            }
        }
    }

    render(): JSX.Element {
        const state = this.props.state;

        return (<>
            <AppBar color="inherit" position="static" className="top-appbar">

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                <Toolbar variant="dense" className="details-top-toolbar">

                    {state.details.entityType === "Orchestration" && (
                        <OrchestrationButtons state={state} disabled={this.context.readOnlyMode || state.inProgress} />
                    )}
                    {state.details.entityType === "DurableEntity" && (
                        <DurableEntityButtons state={state} disabled={this.context.readOnlyMode || state.inProgress} />
                    )}
                    
                    <Box width={20} />
                    <Typography style={{ flex: 1 }} />

                    <FormControl>
                        <InputLabel htmlFor="auto-refresh-select">Auto-refresh</InputLabel>
                        <Select
                            className="toolbar-select"
                            value={state.autoRefresh}
                            onChange={(evt) => state.autoRefresh = evt.target.value as number}
                            inputProps={{ id: 'auto-refresh-select' }}>
                            <MenuItem value={0}>Never</MenuItem>
                            <MenuItem value={1}>Every 1 sec.</MenuItem>
                            <MenuItem value={5}>Every 5 sec.</MenuItem>
                            <MenuItem value={10}>Every 10 sec.</MenuItem>
                        </Select>
                    </FormControl>

                    <Box width={20} />

                    <Button
                        className="details-refresh-button"
                        variant="outlined"
                        color="default"
                        size="large"
                        disabled={state.inProgress && !state.loadInProgress}
                        onClick={() => state.loadInProgress ? state.cancel() : state.loadDetails()}
                    >
                        {state.loadInProgress ? (<CancelOutlinedIcon />) : (<RefreshIcon />)}
                    </Button>

                </Toolbar>
            </AppBar>

            {!!state.tabStates.length && (<>
                <AppBar color="inherit" position="static">
                    <Tabs className="tab-buttons" value={state.tabIndex}
                        onChange={(ev: React.ChangeEvent<{}>, val) => {
                            // Link to functions graph should not be selectable
                            if (val !== 'functions-graph-link') {
                                state.tabIndex = val;
                            }
                        }}>
                        
                        <Tab className="tab-buttons" disabled={state.inProgress} 
                            label={<Typography color="textPrimary" variant="subtitle2">Details</Typography>}
                        />
                        
                        {state.tabStates.map(tabState => (
                            <Tab className="tab-buttons" key={tabState.name} disabled={state.inProgress} 
                                label={<Typography color="textPrimary" variant="subtitle2">{tabState.name}</Typography>}
                            />
                        ))}

                    </Tabs>
                </AppBar>
            </>)}

            {!state.tabIndex && state.details.entityType === "Orchestration" && (<>
                <OrchestrationFields state={state} />

                {state.inProgress && !!state.history.length ? (<LinearProgress />) : (<Box height={4} />)}
            </>)}

            {!state.tabIndex && state.details.entityType === "DurableEntity" &&
                <DurableEntityFields details={state.details} />
            }

            {!!state.selectedTab && state.selectedTab.tabType === CustomTabTypeEnum.FunctionGraph && (

                <OrchestrationDetailsFunctionGraph
                    state={state.selectedTab as FunctionGraphTabState}
                    inProgress={state.inProgress}
                    fileName={state.orchestrationId}
                    backendClient={state.backendClient}
                />
            )}

            {!!state.selectedTab && state.selectedTab.tabType !== CustomTabTypeEnum.FunctionGraph && !!state.selectedTab.rawHtml && (<>

                <div
                    className="raw-html-div"
                    style={CustomTabStyle}
                    dangerouslySetInnerHTML={{ __html: getStyledSvg(state.selectedTab.rawHtml) }}
                />
                
                {state.selectedTab.tabType === CustomTabTypeEnum.MermaidDiagram && (

                    <Toolbar variant="dense">
                        <Typography style={{ flex: 1 }} />

                        <Button
                            variant="outlined"
                            color="default"
                            disabled={state.inProgress}
                            onClick={() => window.navigator.clipboard.writeText(state.selectedTab.description)}
                        >
                            <FileCopyIcon />
                            <Box width={10} />
                            <Typography color="inherit">Copy diagram code to Clipboard</Typography>
                        </Button>

                        <Box width={20} />

                        <SaveAsSvgButton
                            svg={getStyledSvg(state.selectedTab.rawHtml)}
                            fileName={state.orchestrationId}
                            inProgress={state.inProgress}
                            backendClient={state.backendClient}
                        />

                        <Box width={20} />
                    </Toolbar>
                )}
                
            </>)}

            <ErrorMessage state={this.props.state} />
        </>);
    }

    private mountClickEventToFunctionNodes(nodes: HTMLCollection): void {

        const state = this.props.state;

        for (var i = 0; i < nodes.length; i++) {
            const el = nodes[i] as HTMLElement;
            
            var functionName = el.getAttribute('data-function-name');
            if (!functionName) {
                
                functionName = el.innerHTML;
                const match = />(.+)</.exec(functionName);
                if (!!match) {
                    functionName = match[1];
                }
            }

            if (!!state.functionNames[functionName]) {

                const closuredFunctionName = functionName;
                el.onclick = () => state.gotoFunctionCode(closuredFunctionName);

                el.style.cursor = 'pointer';
                el.onmouseenter = (evt) => { (evt.target as HTMLElement).style.strokeOpacity = '0.5'; };
                el.onmouseleave = (evt) => { (evt.target as HTMLElement).style.strokeOpacity = '1'; };
            }
        }
    }
}
