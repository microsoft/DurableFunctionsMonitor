// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Container, CircularProgress, Dialog, DialogContent, DialogContentText,
    List, ListItem, Link,
    Menu, MenuItem, Typography, DialogTitle, Tooltip, DialogActions
} from '@mui/material';

import { AccountCircle, Error } from '@mui/icons-material';

import './LoginIcon.css';

import { LoginState } from '../states/LoginState';

import { Theme } from '../theme';

// Main Menu view
@observer
export class LoginIcon extends React.Component<{ state: LoginState }> {

    render(): JSX.Element {
        const state = this.props.state;

        return (
            <div>
                <Tooltip title={!state.isLoggedInAnonymously ? state.userName : 'Ensure this endpoint is not exposed to the public!'} >
                    <Button color={state.isLoggedInAnonymously ? "secondary" : "inherit"}
                        onClick={evt => state.menuAnchorElement = evt.currentTarget}
                    >
                        <AccountCircle />
                        <Box width={5} />
                        <Typography color={state.isLoggedInAnonymously ? 'secondary' : 'inherit'} >
                            {!state.isLoggedInAnonymously ? '' : 'Anonymous'}
                        </Typography>
                    </Button>
                </Tooltip>

                {!state.isLoggedInAnonymously && (
                    <Menu
                        anchorEl={state.menuAnchorElement}
                        keepMounted
                        open={!!state.menuAnchorElement}
                        onClose={() => state.menuAnchorElement = undefined}
                    >
                        <MenuItem onClick={() => state.logout()}>Login under a different name</MenuItem>
                    </Menu>
                )}
                
                <Dialog open={!state.isLoggedIn}>

                    {!state.errorMessage ? (!state.allowedTaskHubNames ? (<DialogContent>
                        
                        <Container className="login-progress">
                            <CircularProgress />
                        </Container>
                        <DialogContentText>Login in progress...</DialogContentText>

                    </DialogContent>) : (<DialogContent>
                            
                        {state.allowedTaskHubNames?.length ? (
                            <DialogTitle>Select your Task Hub</DialogTitle>
                        ) : (
                            <DialogTitle>No Task Hubs found. <br/> Make sure your connection settings are correct.</DialogTitle>
                        )}

                        <List className="task-hub-list">
                            {state.allowedTaskHubNames.map(hubName => (
                                <ListItem button key={hubName} onClick={() => window.location.assign(state.locationPathName + hubName)}>
                                    <Link color={Theme.palette.mode === 'dark' ? 'inherit' : 'primary'}>{hubName}</Link>
                                </ListItem>)
                            )}
                        </List>
                        
                    </DialogContent>)): (<>
                    
                        <DialogContent>
                            <Container className="login-progress">
                                <Error color="secondary" fontSize="large" />
                            </Container>
                            <DialogContentText color="secondary">Login failed. {state.errorMessage}</DialogContentText>
                        </DialogContent>
                        
                        <DialogActions>
                            <Button color="inherit" onClick={() => state.logout()}>
                                Login under a different name
                            </Button>
                        </DialogActions>

                    </>)}

                </Dialog>
            </div>
        );
    }
}