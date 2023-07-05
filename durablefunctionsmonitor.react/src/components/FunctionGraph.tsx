// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import { AppBar, Box, Button, Checkbox, FormControlLabel, FormHelperText, LinearProgress, Link, Toolbar, Typography } from '@mui/material';

import './FunctionGraph.css';

import RefreshIcon from '@mui/icons-material/Refresh';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { ErrorMessage } from './ErrorMessage';
import { FunctionGraphBase } from './FunctionGraphBase';
import { FunctionGraphState } from '../states/FunctionGraphState';
import { CustomTabStyle } from '../theme';
import { SaveAsSvgButton, getStyledSvg } from './SaveAsSvgButton';
import { Theme } from '../theme';

// Function Graph view
@observer
export class FunctionGraph extends FunctionGraphBase<{ state: FunctionGraphState }> {

    componentDidMount() {

        // Triggering initial load
        this.props.state.load();
    }

    componentDidUpdate() {

        // Mounting click handlers to diagram nodes. Built-in mermaid feature for this doesn't work inside vsCode (no idea why)
        const svgElement = document.getElementById('mermaidSvgId');

        if (!!svgElement) {

            for (const className of ['function', 'orchestrator', 'activity', 'entity', 'proxy']) {
                this.mountClickEventToFunctionNodes(svgElement.getElementsByClassName(className));
            }
        }
    }
    
    render(): JSX.Element {
        const state = this.props.state;

        return (<>
            <AppBar color="inherit" position="static" className="top-appbar">

                {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                <Toolbar variant="dense">
                    <Box width={20} />

                    <FormControlLabel
                        control={<Checkbox
                            color="default"
                            disabled={state.inProgress}
                            checked={state.renderFunctions}
                            onChange={(evt) => state.renderFunctions = evt.target.checked}
                        />}
                        label={<Typography color="textPrimary">Show Functions</Typography>}
                    />
                    <Box width={20} />

                    <FormControlLabel
                        control={<Checkbox
                            color="default"
                            disabled={state.inProgress}
                            checked={state.renderProxies}
                            onChange={(evt) => state.renderProxies = evt.target.checked}
                        />}
                        label={<Typography color="textPrimary">Show Proxies</Typography>}
                    />
                    
                    <Box width={20} />
                    <Typography style={{ flex: 1 }} />

                    <Button
                        className="details-refresh-button"
                        variant="outlined"
                        color="inherit"
                        size="large"
                        disabled={state.inProgress}
                        onClick={() => state.load()}
                    >
                        <RefreshIcon />
                    </Button>

                </Toolbar>
            </AppBar>

            <FormHelperText className="link-to-az-func-as-a-graph" >
                powered by <Link
                    color={Theme.palette.mode === 'dark' ? 'inherit' : 'primary'} 
                    variant="inherit"
                    href="https://github.com/scale-tone/az-func-as-a-graph"
                >
                    az-func-as-a-graph
                </Link>
            </FormHelperText>

            {!!state.diagramSvg && (<>

                <div
                    className="diagram-div"
                    style={CustomTabStyle}
                    dangerouslySetInnerHTML={{ __html: getStyledSvg(state.diagramSvg) }}
                />

                <Toolbar variant="dense">

                    <Button
                        variant="outlined"
                        color="inherit"
                        disabled={state.inProgress}
                        onClick={() => window.navigator.clipboard.writeText(state.diagramCode)}
                    >
                        <FileCopyIcon />
                        <Box width={10} />
                        <Typography color="inherit">Copy diagram code to Clipboard</Typography>
                    </Button>

                    <Box width={20} />

                    <SaveAsSvgButton
                        svg={getStyledSvg(state.diagramSvg)}
                        fileName="functions.svg"
                        inProgress={state.inProgress}
                        backendClient={state.backendClient}
                    />

                    <Box width={20} />

                    <Button
                        variant="outlined"
                        color="inherit"
                        disabled={state.inProgress}
                        onClick={() => state.saveAsJson()}
                    >
                        <SaveAltIcon />
                        <Box width={10} />
                        <Typography color="inherit">Save as JSON</Typography>
                    </Button>
                    
                </Toolbar>

            </>)}

            <ErrorMessage state={this.props.state} />
        </>);
    }
}