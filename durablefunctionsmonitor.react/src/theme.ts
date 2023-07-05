// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createTheme } from '@mui/material';

import { RuntimeStatus } from './states/DurableOrchestrationStatus';
import { dfmContextInstance } from './DfmContext';

const colorTheme = !process.env.REACT_APP_COLOR_THEME ? dfmContextInstance.theme : process.env.REACT_APP_COLOR_THEME;

export const Theme = createTheme({
    palette: { mode: colorTheme === 'dark' ? 'dark' : 'light' }
});

export const CustomTabStyle = Theme.palette.mode === 'dark' ? {
    backgroundColor: '#aaa'
} : {};

export const PrimaryButtonColor = Theme.palette.mode === 'dark' ? 'inherit' : 'primary';

export function RuntimeStatusToStyle(status: RuntimeStatus): {} {

    var backgroundColor: string = null;

    switch (status) {
        case 'Failed':
            backgroundColor = hexToRGBA(Theme.palette.error.light, 0.2);
            break;
        case 'Completed':
            backgroundColor = hexToRGBA(Theme.palette.success.light, 0.2);
            break;
        case 'Running':
            backgroundColor = hexToRGBA(Theme.palette.warning.light, 0.2);
            break;
        case 'Terminated':
            backgroundColor = hexToRGBA(Theme.palette.background.paper, 0.1);
            break;
    }

    return !!backgroundColor ? { backgroundColor } : {};
}

export function hexToRGBA(hex: string, alpha: number): string {

    if (hex.length > 4) {
        return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha.toFixed(1)})`;
    } else {
        return `rgba(${parseInt(hex.slice(1, 2), 16)}, ${parseInt(hex.slice(2, 3), 16)}, ${parseInt(hex.slice(3, 4), 16)}, ${alpha.toFixed(1)})`;
    }
}

export function RuntimeStatusToBadgeStyle(status: RuntimeStatus | 'Duration'): {} {

    var backgroundColor: string = null;

    if (Theme.palette.mode === 'dark') {
        
        switch (status) {
            case 'Failed':
                backgroundColor = 'rgb(103,73,76)';
                break;
            case 'Completed':
                backgroundColor = 'rgb(74,98,80)';
                break;
            case 'Running':
                backgroundColor = 'rgb(105,93,68)';
                break;
            case 'Terminated':
                backgroundColor = 'rgb(66,66,66)';
                break;
            case 'Duration':
                backgroundColor = 'rgb(50,50,50)';
                break;
        }
    } else {

        switch (status) {
            case 'Failed':
                backgroundColor = 'rgb(250,227,227)';
                break;
            case 'Completed':
                backgroundColor = 'rgb(230,244,230)';
                break;
            case 'Running':
                backgroundColor = 'rgb(255,241,219)';
                break;
            case 'Terminated':
                backgroundColor = 'rgb(231,231,231)';
                break;
            case 'Duration':
                backgroundColor = 'rgb(255,255,255)';
                break;
        }
    }

    return !!backgroundColor ? { backgroundColor } : {};
}
