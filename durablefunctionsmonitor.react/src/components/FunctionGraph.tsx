import * as React from 'react';
import { observer } from 'mobx-react';

import { AppBar, Box, Button, Checkbox, FormControlLabel, FormHelperText, LinearProgress, Link, Toolbar, Typography } from '@material-ui/core';

import './FunctionGraph.css';

import RefreshIcon from '@material-ui/icons/Refresh';
import FileCopyIcon from '@material-ui/icons/FileCopy';
import SaveAltIcon from '@material-ui/icons/SaveAlt';
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
                        color="default"
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
                    color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} 
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
                        color="default"
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
                        color="default"
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