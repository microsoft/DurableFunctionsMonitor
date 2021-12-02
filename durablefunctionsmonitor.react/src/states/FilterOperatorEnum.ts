// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export enum FilterOperatorEnum {
    Equals = 0,
    StartsWith,
    Contains,
    NotEquals,
    NotStartsWith,
    NotContains,
    In,
    NotIn
}

function toArrayOfStrings(str: string): string[] {
        
    if (str.trim().startsWith('[')) {

        // Treat it as JSON array
        try {
            return JSON.parse(str).map(v => `'${v}'`);
        } catch {
        }
    }

    // Treat it as CSV
    return str.split(',').map(v => {
        var value = v.trim();
        return value.startsWith(`'`) ? value : `'${value}'`;
    });
}

export function toOdataFilterQuery(filteredColumn: string, filterOperator: FilterOperatorEnum, filterValue: string): string {

    if (!filterValue || !filteredColumn || (filteredColumn === '0')) {
        return '';
    }

    switch (filterOperator) {
        case FilterOperatorEnum.Equals:
            return `${filteredColumn} eq '${encodeURIComponent(filterValue)}'`;
        case FilterOperatorEnum.StartsWith:
            return `startswith(${filteredColumn}, '${encodeURIComponent(filterValue)}')`;
        case FilterOperatorEnum.Contains:
            return `contains(${filteredColumn}, '${encodeURIComponent(filterValue)}')`;
        case FilterOperatorEnum.NotEquals:
            return `${filteredColumn} ne '${encodeURIComponent(filterValue)}'`;
        case FilterOperatorEnum.NotStartsWith:
            return `startswith(${filteredColumn}, '${encodeURIComponent(filterValue)}') eq false`;
        case FilterOperatorEnum.NotContains:
            return `contains(${filteredColumn}, '${encodeURIComponent(filterValue)}') eq false`;
        case FilterOperatorEnum.In:
        case FilterOperatorEnum.NotIn:

            const values = toArrayOfStrings(filterValue);
           
            var result = `${filteredColumn} in (${values.map(v => encodeURIComponent(v)).join(',')})`;

            if (filterOperator === FilterOperatorEnum.NotIn) {
                result += ' eq false';
            }

            return result;
        default:
            return '';
    }
}
