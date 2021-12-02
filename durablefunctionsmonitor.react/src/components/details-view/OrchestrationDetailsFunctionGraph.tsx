// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Checkbox, Chip, FormGroup, FormControlLabel, FormHelperText, Link, Toolbar, Tooltip, Typography
} from '@material-ui/core';

import FileCopyIcon from '@material-ui/icons/FileCopy';

import { FunctionGraphTabState } from '../../states/details-view/FunctionGraphTabState';
import { SaveAsSvgButton, getStyledSvg } from '../SaveAsSvgButton';
import { IBackendClient } from '../../services/IBackendClient';
import { DateTimeHelpers } from '../../DateTimeHelpers';
import { FunctionGraphTabBase } from '../FunctionGraphTabBase';

import { CustomTabStyle, Theme } from '../../theme';

// Interactive Function Graph view
@observer
export class OrchestrationDetailsFunctionGraph extends FunctionGraphTabBase<{ state: FunctionGraphTabState, inProgress: boolean, fileName: string, backendClient: IBackendClient }> {

    componentDidMount() {

        // On details tab we also show metrics for activities, so need to override this
        FunctionGraphTabBase.nodeTypesToHighlight = ['orchestrator', 'entity', 'activity'];

        window.addEventListener('resize', OrchestrationDetailsFunctionGraph.repositionMetricHints);
        OrchestrationDetailsFunctionGraph.repositionMetricHints();
    }

    componentWillUnmount() {

        window.removeEventListener('resize', OrchestrationDetailsFunctionGraph.repositionMetricHints);
    }

    componentDidUpdate() {

        OrchestrationDetailsFunctionGraph.repositionMetricHints();

        const svgElement = document.getElementById('mermaidSvgId');
        if (!!svgElement) {

            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('function'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('orchestrator'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('activity'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('entity'));
            this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName('proxy'));
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
            </>)}
        </>);
    }

    private renderMetrics(): JSX.Element[] {
        
        const state = this.props.state;

        return Object.keys(state.metrics).map(functionName => {

            const metric = state.metrics[functionName];
            const totalInstances = (metric.completed ?? 0) + (metric.running ?? 0) + (metric.failed ?? 0) + (metric.other ?? 0);

            return (<span id={`metrics-hint-${functionName.toLowerCase()}`} key={`metrics-hint-${functionName}`} className="metrics-span">

                {!!metric.completed && (
                    <Tooltip title={totalInstances === 1 ? `runtimeStatus` : `Number of completed instances`}>
                        <Chip className="metrics-chip" style={this.CompletedStyle} variant="outlined" size="small"
                            label={totalInstances === 1 ? `completed` : `${metric.completed}`}
                        />
                    </Tooltip>
                )}
                {!!metric.running && (
                    <Tooltip title={totalInstances === 1 ? `runtimeStatus` : `Number of running instances`}>
                        <Chip className="metrics-chip" style={this.RunningStyle} variant="outlined" size="small"
                            label={totalInstances === 1 ? `running` : `${metric.running}`}
                        />
                    </Tooltip>
                )}
                {!!metric.failed && (
                    <Tooltip title={totalInstances === 1 ? `runtimeStatus` : `Number of failed instances`}>
                        <Chip className="metrics-chip" style={this.FailedStyle} variant="outlined" size="small"
                            label={totalInstances === 1 ? `failed` : `${metric.failed}`}
                        />
                    </Tooltip>
                )}
                {!!metric.other && (
                    <Tooltip title={totalInstances === 1 ? `runtimeStatus` : `Number of terminated/cancelled instances`}>
                        <Chip className="metrics-chip" style={this.OtherStyle} variant="outlined" size="small"
                            label={totalInstances === 1 ? `terminated` : `${metric.other}`}
                        />
                    </Tooltip>
                )}

                {!!metric.duration && (
                    <Tooltip title={totalInstances === 1 ? `Duration` : `Max Duration`}>
                        <Chip className="metrics-chip" style={this.DurationStyle} variant="outlined" size="small"
                            label={DateTimeHelpers.formatDuration(metric.duration)}
                        />
                    </Tooltip>
                )}
                
            </span>);
        });
    }
}