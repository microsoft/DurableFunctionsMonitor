// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as React from 'react';

import { Theme } from '../theme';

// Highlights filter string in a text being rendered
export function renderFilteredField(text: string, filterValue: string): string | JSX.Element[] {

    if (!filterValue) {
        return text;
    }

    const result: JSX.Element[] = [];

    var pos = 0;
    const regex = new RegExp(filterValue, 'gi');

    var match: RegExpExecArray | null;
    while (!!(match = regex.exec(text))) {

        result.push(
            <>{text.substring(pos, match.index)}</>,
            <span style={{backgroundColor : Theme.palette.mode === 'dark' ? 'darkblue' : 'azure'}}>{match[0]}</span>
        );

        pos = match.index + match[0].length;
    }

    result.push(<>{text.substring(pos)}</>);

    return result;
}
