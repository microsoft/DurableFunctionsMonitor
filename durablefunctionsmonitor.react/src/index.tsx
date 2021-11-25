import * as React from 'react';
import * as ReactDOM from 'react-dom';

import { ThemeProvider } from "@material-ui/styles";

import './index.css';
import '../node_modules/react-vis/dist/style.css';

import { Main } from './components/Main';
import { MainState } from './states/MainState';
import { Theme } from './theme';

document.body.style.backgroundColor = Theme.palette.background.paper;

// This is the app's global state. It consists of multiple parts, consumed by multiple nested components
const appState = new MainState();

ReactDOM.render(
    <ThemeProvider theme={Theme} >
        <Main state={appState} />
    </ThemeProvider>,
    document.getElementById('root') as HTMLElement
);