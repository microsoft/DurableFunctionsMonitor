// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';
import { observer } from 'mobx-react';

import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, InputBase
} from '@mui/material';

import { renderFilteredField } from '../RenderHelpers';

import { PrimaryButtonColor } from '../../theme';

const MaxJsonLengthToShow = 512;

export type LongJsonDialogState = { title?: string, jsonString?: string, filterValue?: string };

// Dialog to display long JSON strings
@observer
export class LongJsonDialog extends React.Component<{ state: LongJsonDialogState }> {
    
    public static formatJson(jsonObject: any): string {

        if (!jsonObject) {
            return "";
        }

        // Converting from a string inside a string
        if (typeof jsonObject === 'string') {
            try {
                jsonObject = JSON.parse(jsonObject);
            } catch {}
        }

        return (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject, null, 3));
    }

    public static renderJson(jsonObject: any, dialogTitle: string, dialogState: LongJsonDialogState, filterValue?: string): JSX.Element {

        if (!jsonObject) {
            return null;
        }

        // Converting from a string inside a string
        if (typeof jsonObject === 'string') {
            try {
                jsonObject = JSON.parse(jsonObject);
            } catch {}
        }

        const jsonString = (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject));
        const jsonFormattedString = (typeof jsonObject === 'string' ? jsonObject : JSON.stringify(jsonObject, null, 3));

        return (<div className="long-text-cell-input"
            onClick={() => {
                dialogState.title = dialogTitle;
                dialogState.jsonString = jsonFormattedString;
                dialogState.filterValue = filterValue;
            }}
        >
            {renderFilteredField(jsonString.substr(0, MaxJsonLengthToShow), filterValue)}
        </div>);
    }

    render(): JSX.Element {
        const state = this.props.state;

        return (
            <Dialog fullWidth={true} maxWidth="md" open={!!state.jsonString} onClose={() => state.jsonString = ''}>

                <DialogTitle>{state.title}</DialogTitle>

                <DialogContent>

                    {!state.filterValue ? (

                        <InputBase multiline fullWidth readOnly value={state.jsonString} />
                        
                    ) : 
                            
                        renderFilteredField(state.jsonString, state.filterValue)
                    }

                </DialogContent>
                
                <DialogActions>
                    <Button onClick={() => state.jsonString = ''} color={PrimaryButtonColor}>
                        Close
                    </Button>
                </DialogActions>

            </Dialog>
       );
    }
}