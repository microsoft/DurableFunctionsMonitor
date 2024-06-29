// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import { AppBar, Autocomplete, Breadcrumbs, Box, Link, TextField, Toolbar, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment'

import './Main.css';

import { LoginIcon } from './LoginIcon';
import { MainMenu } from './MainMenu';
import { MainState } from '../states/MainState';
import { Orchestrations } from './results-view/Orchestrations';
import { OrchestrationDetails } from './details-view/OrchestrationDetails';
import { FunctionGraph } from './FunctionGraph';
import { PurgeHistoryDialog } from './dialogs/PurgeHistoryDialog';
import { CleanEntityStorageDialog } from './dialogs/CleanEntityStorageDialog';
import { ConnectionParamsDialog } from './dialogs/ConnectionParamsDialog';
import { StartNewInstanceDialog } from './dialogs/StartNewInstanceDialog';
import { BatchOpsDialog } from './dialogs/BatchOpsDialog';

import { DfmContextType, dfmContextInstance } from '../DfmContext';
import { ErrorMessage } from './ErrorMessage';

// DFM-specific route prefix, that is passed to us from the backend via a global static variable
declare const DfmRoutePrefix: string;

// The main application view
@observer
export class Main extends React.Component<{ state: MainState }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (
            <LocalizationProvider dateAdapter={AdapterMoment}><DfmContextType.Provider value={dfmContextInstance}>

                {!state.loginState && (
                    <Box height={20}/>
                )}
                
                {!!state.loginState && (
                    <AppBar position="static" color="default" className="app-bar">
                        <Toolbar>

                            {state.loginState.isLoggedIn && !!state.mainMenuState && (
                                <MainMenu state={state.mainMenuState} doRefresh={() => state.orchestrationsState.reloadOrchestrations()} />
                            )}

                            <img src={`${!DfmRoutePrefix ? '' : '/'}${DfmRoutePrefix}/logo.svg`} width="30px" alt="logo"></img>
                            <Box width={5} />

                            <Typography variant="h6" color="inherit" className="title-typography">
                                <Link color="inherit" href={state.loginState.rootUri}>
                                    Durable Functions Monitor
                                </Link>
                            </Typography>

                            {!!state.loginState.taskHubName && (<>
                                
                                / &nbsp;

                                <Breadcrumbs color="inherit">

                                    <Link color="inherit" href={state.loginState.locationPathName}>
                                        {state.loginState.taskHubName}
                                    </Link>

                                    {!state.orchestrationDetailsState ?
                                        (
                                            <Autocomplete
                                                className="instance-id-input"
                                                freeSolo
                                                options={state.isExactMatch ? [] : state.suggestions}
                                                value={state.typedInstanceId}
                                                onChange={(evt, newValue) => {
                                                    state.typedInstanceId = newValue ?? '';
                                                    if (!!newValue) {
                                                        state.goto();
                                                    }
                                                }}
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        className={state.isExactMatch ? 'instance-id-valid' : null}
                                                        size="small"
                                                        label="instanceId to go to..."
                                                        variant="outlined"
                                                        onChange={(evt) => state.typedInstanceId = evt.target.value as string}
                                                        onKeyPress={(evt) => this.handleKeyPress(evt)}
                                                    />
                                                )}
                                            />
                                        )
                                        :
                                        (<Typography color="inherit">
                                            <Link color="inherit" href={window.location.pathname}>
                                                {state.orchestrationDetailsState.orchestrationId}
                                            </Link>
                                        </Typography>)
                                    }

                                </Breadcrumbs>
                            </>)}

                            <Typography style={{ flex: 1 }} />

                            <LoginIcon state={state.loginState} />
                        </Toolbar>
                    </AppBar>
                )}

                {!!state.orchestrationsState && (!state.loginState || state.loginState.isLoggedIn) && (
                    <Orchestrations state={state.orchestrationsState} />
                )}

                {!!state.orchestrationDetailsState && (!state.loginState || state.loginState.isLoggedIn) && (
                    <OrchestrationDetails state={state.orchestrationDetailsState} />
                )}

                {!!state.functionGraphState && (!state.loginState || state.loginState.isLoggedIn) && (
                    <FunctionGraph state={state.functionGraphState} />
                )}

                {!!state.purgeHistoryDialogState && (
                    <PurgeHistoryDialog state={state.purgeHistoryDialogState}/>
                )}

                {!!state.cleanEntityStorageDialogState && (
                    <CleanEntityStorageDialog state={state.cleanEntityStorageDialogState} />
                )}
            
                {!!state.startNewInstanceDialogState && (
                    <StartNewInstanceDialog state={state.startNewInstanceDialogState} />
                )}

                {!!state.batchOpsDialogState && (
                    <BatchOpsDialog state={state.batchOpsDialogState} />
                )}

                {!!state.connectionParamsDialogState && (
                    <ConnectionParamsDialog state={state.connectionParamsDialogState} />
                )}

                <ErrorMessage state={state} />

            </DfmContextType.Provider></LocalizationProvider>
        );
    }

    private handleKeyPress(event: React.KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Enter') {
            // Otherwise the event will bubble up and the form will be submitted
            event.preventDefault();

            this.props.state.goto();
        }
    }
}