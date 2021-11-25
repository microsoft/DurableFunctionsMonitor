import * as React from 'react';
import { observer } from 'mobx-react';

import {
    FormControlLabel, IconButton, Menu, MenuItem, Radio, RadioGroup, Typography
} from '@material-ui/core';

import './MainMenu.css';

import MenuIcon from '@material-ui/icons/Menu';

import { MainMenuState } from '../states/MainMenuState';

import { DfmContextType } from '../DfmContext';

// Main Menu view
@observer
export class MainMenu extends React.Component<{ state: MainMenuState, doRefresh: () => void }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    componentDidMount() {
        // Querying the backend for connection info and displaying it in window title
        this.props.state.setWindowTitle();
    }

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

                <MenuItem onClick={() => state.showConnectionParamsDialog()}>Manage Storage Connection Settings...</MenuItem>
                <MenuItem onClick={() => state.showPurgeHistoryDialog()}>Purge Instance History...</MenuItem>
                <MenuItem onClick={() => state.showCleanEntityStorageDialog()}>Clean Entity Storage...</MenuItem>
                <MenuItem onClick={() => state.showStartNewInstanceDialog()}>Start New Orchestration Instance...</MenuItem>
            </Menu>
        </>);
    }
}