// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Checkbox, Chip, FormGroup, FormControlLabel, FormHelperText, Link, Menu, MenuItem, Toolbar, Tooltip, Typography
} from '@material-ui/core';

import FileCopyIcon from '@material-ui/icons/FileCopy';

import './OrchestrationsFunctionGraph.css';

import { ResultsFunctionGraphTabState } from '../../states/results-view/ResultsFunctionGraphTabState';
import { SaveAsSvgButton, getStyledSvg } from '../SaveAsSvgButton';
import { IBackendClient } from '../../services/IBackendClient';
import { FunctionGraphTabBase } from '../FunctionGraphTabBase';

import { Theme, CustomTabStyle } from '../../theme';

// Interactive Function Graph view
@observer
export class OrchestrationsFunctionGraph extends FunctionGraphTabBase<{ state: ResultsFunctionGraphTabState, inProgress: boolean, fileName: string, backendClient: IBackendClient }> {

    componentDidMount() {

        window.addEventListener('resize', OrchestrationsFunctionGraph.repositionMetricHints);
        OrchestrationsFunctionGraph.repositionMetricHints();
    }

    componentWillUnmount() {

        window.removeEventListener('resize', OrchestrationsFunctionGraph.repositionMetricHints);
    }

    componentDidUpdate() {

        OrchestrationsFunctionGraph.repositionMetricHints();

        const svgElement = document.getElementById('mermaidSvgId');
        if (!!svgElement) {

            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('function'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('activity'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('entity'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('proxy'));

            this.mountClickEventToOrchestrationNodes(svgElement.getElementsByClassName('orchestrator'));
        }
    }

    render(): JSX.Element {

        const state = this.props.state;

        return (<>
            
            <FormHelperText className="link-to-az-func-as-a-graph" >
                powered by <Link
                    color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} 
                    variant="inherit"
                    href="https://github.com/scale-tone/az-func-as-a-graph"
                >
                    az-func-as-a-graph
                </Link>
            </FormHelperText>

            {!!state.functionsLoaded && (
                <FormGroup row className="settings-group">

                    <FormControlLabel
                        control={<Checkbox
                            color="default"
                            disabled={this.props.inProgress}
                            checked={state.renderFunctions}
                            onChange={(evt) => state.renderFunctions = evt.target.checked}
                        />}
                        label={<Typography color="textPrimary">Show Functions</Typography>}
                    />

                    <FormControlLabel
                        control={<Checkbox
                            color="default"
                            disabled={this.props.inProgress}
                            checked={state.renderProxies}
                            onChange={(evt) => state.renderProxies = evt.target.checked}
                        />}
                        label={<Typography color="textPrimary">Show Proxies</Typography>}
                    />

                    {this.renderTotalMetric()}

                </FormGroup>
            )}

            {this.renderMetrics()}

            {!!state.diagramSvg && (<>
                <div
                    className="diagram-div"
                    style={CustomTabStyle}
                    dangerouslySetInnerHTML={{ __html: getStyledSvg(state.diagramSvg) }}
                />

                <Toolbar variant="dense">

                    <Typography style={{ flex: 1 }} />

                    <Button
                        variant="outlined"
                        color="default"
                        disabled={this.props.inProgress}
                        onClick={() => window.navigator.clipboard.writeText(state.diagramCode)}
                    >
                        <FileCopyIcon />
                        <Box width={10} />
                        <Typography color="inherit">Copy diagram code to Clipboard</Typography>
                    </Button>

                    <Box width={20} />

                    <SaveAsSvgButton
                        svg={getStyledSvg(state.diagramSvg)}
                        fileName={this.props.fileName}
                        inProgress={this.props.inProgress}
                        backendClient={this.props.backendClient}
                    />

                    <Box width={20} />
                </Toolbar>

                <Menu
                    anchorEl={state.menuAnchorElement}
                    anchorOrigin={{ vertical: 'center', horizontal: 'left' }}
                    keepMounted
                    open={!!state.menuAnchorElement}
                    onClose={() => state.menuAnchorElement = undefined}
                >
                    <MenuItem onClick={() => state.gotoOrchestrationCode()}>Go to Code</MenuItem>
                    <MenuItem onClick={() => state.startNewInstance()}>Start New Instance...</MenuItem>
                </Menu>

            </>)}
        </>);
    }

    private renderTotalMetric(): JSX.Element {
        
        const state = this.props.state;
        const totalMetric = state.metrics[state.TotalMetricsName];

        return (!!totalMetric && (!!totalMetric.completed || !!totalMetric.running || !!totalMetric.failed || !!totalMetric.other) && (
            <span className="total-metrics-span">

                <Typography color="textPrimary">Total instances:</Typography>

                <Box width={10}/>
                
                {!!totalMetric.completed && (
                    <Chip className="metrics-chip" style={this.CompletedStyle} variant="outlined" size="small" label={`${totalMetric.completed} completed`} />
                )}
                {!!totalMetric.running && (
                    <Chip className="metrics-chip" style={this.RunningStyle} variant="outlined" size="small" label={`${totalMetric.running} running`} />
                )}
                {!!totalMetric.failed && (
                    <Chip className="metrics-chip" style={this.FailedStyle} variant="outlined" size="small" label={`${totalMetric.failed} failed`} />
                )}
                {!!totalMetric.other && (
                    <Chip className="metrics-chip" style={this.OtherStyle} variant="outlined" size="small" label={`${totalMetric.other} other`} />
                )}
                
            </span>)
        );
    }
    
    private renderMetrics(): JSX.Element[] {
        
        const state = this.props.state;

        return Object.keys(state.metrics).map(functionName => {

            const metric = state.metrics[functionName];

            return (<span id={`metrics-hint-${functionName.toLowerCase()}`} key={`metrics-hint-${functionName}`} className="metrics-span">

                {!!metric.completed && (
                    <Tooltip title="Number of completed instances">
                        <Chip className="metrics-chip" style={this.CompletedStyle} variant="outlined" size="small" label={`${metric.completed}`} />
                    </Tooltip>
                )}
                {!!metric.running && (
                    <Tooltip title="Number of running instances">
                        <Chip className="metrics-chip" style={this.RunningStyle} variant="outlined" size="small" label={`${metric.running}`} />
                    </Tooltip>
                )}
                {!!metric.failed && (
                    <Tooltip title="Number of failed instances">
                        <Chip className="metrics-chip" style={this.FailedStyle} variant="outlined" size="small" label={`${metric.failed}`} />
                    </Tooltip>
                )}
                {!!metric.other && (
                    <Tooltip title="Number of terminated/cancelled instances">
                        <Chip className="metrics-chip" style={this.OtherStyle} variant="outlined" size="small" label={`${metric.other}`} />
                    </Tooltip>
                )}
                
            </span>);
        });
    }

    private mountClickEventToOrchestrationNodes(nodes: HTMLCollection): void {

        const state = this.props.state;

        OrchestrationsFunctionGraph.forEachFunctionNode(nodes, (el, functionName) => {

            el.onclick = () => state.showPopupMenu(el, functionName);

            this.showAsClickable(el);
        })
    }
}