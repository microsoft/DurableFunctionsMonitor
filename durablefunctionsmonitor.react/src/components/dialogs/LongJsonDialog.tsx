// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Box,
    Button, Dialog, DialogActions, DialogContent, DialogTitle, InputBase, LinearProgress, Link
} from '@mui/material';

import { renderFilteredField } from '../RenderHelpers';

import { PrimaryButtonColor } from '../../theme';
import { LongJsonDialogState } from 'src/states/dialogs/LongJsonDialogState';
import { ErrorMessage } from '../ErrorMessage';
import { Theme } from '../../theme';

const MaxJsonLengthToShow = 512;

// Dialog to display long JSON strings
@observer
export class LongJsonDialog extends React.Component<{ filterValue?: string, state: LongJsonDialogState }> {
    
    public static convertLongField(value: any): { value: string, isUrl: boolean } {

        if (!value) {
            return { value: '', isUrl: false };
        }

        if (typeof value === 'string' && LongJsonDialog.isBlobLink(value)) {
            return { value, isUrl: true };
        }

        // Converting from a string inside a string
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value);
            } catch {}
        }

        return {
            value: (typeof value === 'string' ? value : JSON.stringify(value, null, 3)),
            isUrl: false
        };
    }

    public static renderJson(jsonObject: any, filterValue: string, onClick: () => void): JSX.Element {

        if (!jsonObject) {
            return null;
        }

        // Converting from a string inside a string
        if (typeof jsonObject === 'string') {
            try {
                jsonObject = JSON.parse(jsonObject);
            } catch {}
        }

        let jsonString = (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject));
        jsonString = jsonString.substr(0, MaxJsonLengthToShow);

        return (
            <div className="long-text-cell-input" onClick={onClick}>
                {renderFilteredField(jsonString, filterValue)}
            </div>
        );
    }

    render(): JSX.Element {
        const state = this.props.state;

        return (
            <Dialog fullWidth={true} maxWidth="md" open={!!state.value} onClose={() => state.hideDialog()}>

                <DialogTitle>{state.title}</DialogTitle>

                <DialogContent>

                    {state.inProgress ? (<LinearProgress />) : (<Box height={4} />)}

                    {
                        LongJsonDialog.isBlobLink(state.value) ? (

                            <Link className="link-with-pointer-cursor"
                                color={Theme.palette.mode === 'dark' ? 'inherit' : 'primary'}
                                onClick={() => state.downloadFieldValue()}
                            >
                                {state.value}
                            </Link>

                        ) : (
                                
                            !this.props.filterValue ? (<InputBase multiline fullWidth readOnly value={state.value} />) : renderFilteredField(state.value, this.props.filterValue)
                        )
                    }

                    <ErrorMessage state={state} />

                </DialogContent>
                
                <DialogActions>
                    <Button onClick={() => state.hideDialog()} color={PrimaryButtonColor} disabled={state.inProgress}>
                        Close
                    </Button>
                </DialogActions>

            </Dialog>
       );
    }

    private static isBlobLink(str: string): boolean {
        return /^https:\/\//i.test(str);
    }
}