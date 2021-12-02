// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box, Button, Container, CircularProgress, Dialog, DialogContent, DialogContentText,
    List, ListItem, Link,
    Menu, MenuItem, Tooltip, Typography, DialogTitle
} from '@material-ui/core';

import { AccountCircle, Error } from '@material-ui/icons';

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
                <Button color={state.isLoggedInAnonymously ? "secondary" : "inherit"}
                    onClick={evt => state.menuAnchorElement = evt.currentTarget}
                >
                    <AccountCircle />
                    <Box width={5} />
                    <Tooltip title={state.isLoggedInAnonymously ? "Ensure this endpoint is not exposed to the public!" : ""} >
                        <Typography color={state.isLoggedInAnonymously ? "secondary" : "inherit"} >
                            {state.isLoggedInAnonymously ? "Anonymous" : state.userName}
                        </Typography>
                    </Tooltip>
                </Button>

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
                    <DialogContent>

                        {!state.errorMessage ? (!state.allowedTaskHubNames ? (<>
                            
                            <Container className="login-progress">
                                <CircularProgress />
                            </Container>
                            <DialogContentText>Login in progress...</DialogContentText>

                        </>) : (<>
                                
                            <DialogTitle>Select your Task Hub</DialogTitle>
                            <List className="task-hub-list">
                                {state.allowedTaskHubNames.map(hubName => (
                                    <ListItem button key={hubName}>
                                        <Link color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} href={state.locationPathName + hubName}>{hubName}</Link>
                                    </ListItem>)
                                )}
                            </List>
                            
                        </>)): (<>
                        
                            <Container className="login-progress">
                                <Error color="secondary" fontSize="large" />
                            </Container>
                            <DialogContentText color="secondary">Login failed. {state.errorMessage}</DialogContentText>
                            
                        </>)}

                    </DialogContent>
                </Dialog>
            </div>
        );
    }
}