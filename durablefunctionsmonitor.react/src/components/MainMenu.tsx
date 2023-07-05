// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    FormControlLabel, IconButton, Menu, MenuItem, Radio, RadioGroup, Typography
} from '@mui/material';

import './MainMenu.css';

import MenuIcon from '@mui/icons-material/Menu';

import { MainMenuState } from '../states/MainMenuState';

import { DfmContextType } from '../DfmContext';

// Main Menu view
@observer
export class MainMenu extends React.Component<{ state: MainMenuState, doRefresh: () => void }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    render(): JSX.Element {
        const state = this.props.state;

        return (<>
            <IconButton color="inherit"
                onClick={evt => state.menuAnchorElement = evt.currentTarget}
            >
                <MenuIcon/>
            </IconButton>

            <Menu
                anchorEl={state.menuAnchorElement}
                keepMounted
                open={!!state.menuAnchorElement}
                onClose={() => state.menuAnchorElement = undefined}
            >
                <RadioGroup row value={this.context.showTimeAsLocal.toString()} onChange={(evt) => {
                    this.context.showTimeAsLocal = (evt.target as HTMLInputElement).value === 'true';
                    state.menuAnchorElement = undefined;
                    this.props.doRefresh();
                }}>
                    <Typography className="show-time-as-typography">Show time as:</Typography>
                    <FormControlLabel control={<Radio color="primary"/>} label="UTC" value={'false'} />
                    <FormControlLabel control={<Radio color="primary"/>} label="Local" value={'true'} />
                </RadioGroup>

                <MenuItem onClick={() => state.showConnectionParamsDialog()}>View Storage Connection Settings...</MenuItem>
                <MenuItem disabled={this.context.readOnlyMode} onClick={() => state.showPurgeHistoryDialog()}>Purge Instance History...</MenuItem>
                <MenuItem disabled={this.context.readOnlyMode} onClick={() => state.showCleanEntityStorageDialog()}>Clean Entity Storage...</MenuItem>
                <MenuItem disabled={this.context.readOnlyMode} onClick={() => state.showStartNewInstanceDialog()}>Start New Orchestration Instance...</MenuItem>
            </Menu>
        </>);
    }
}