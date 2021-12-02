// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Helper class for dealing with browser's query string
export class QueryString {

    constructor() {

        const pairs = window.location.search.substr(1).split('&');
        for (var pairString of pairs) {
            const pair = pairString.split('=');
            if (pair.length > 1) {
                this._values[pair[0]] = decodeURIComponent(pair[1]);
            }
        }
    }

    get values(): { [key: string]: string } { return this._values; }

    setValue(key: string, val: string): void {

        if (!!val) {
            this.values[key] = val;
        } else {
            delete this.values[key];
        }
    }

    apply(pushState: boolean = false): void {

        var queryString = '';

        for (var key in this._values) {
            if (!!queryString) {
                queryString += '&';
            }
            queryString += key + '=' + encodeURIComponent(this._values[key]);
        }

        if (pushState) {
            window.history.pushState(null, null, !queryString ? '' : '?' + queryString);
        } else {
            window.history.replaceState(null, null, !queryString ? '' : '?' + queryString);
        }
    }

    private _values: { [key: string]: string } = {};
}