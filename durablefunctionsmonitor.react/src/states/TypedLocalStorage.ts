import { ITypedLocalStorage } from './ITypedLocalStorage';
import { QueryString } from './QueryString';

// Stores field values in a localStorage
export class TypedLocalStorage<T> implements ITypedLocalStorage<T>
{
    constructor(private _prefix: string) { }

    setItem(fieldName: Extract<keyof T, string>, value: string) {

        localStorage.setItem(`${this._prefix}::${fieldName}`, value);

        // Also placing into query string
        const queryString = new QueryString();
        queryString.values[fieldName] = value;
        queryString.apply();
    }

    setItems(items: { fieldName: Extract<keyof T, string>, value: string | null }[]) {

        // Also placing into query string
        const queryString = new QueryString();

        for (const item of items) {
            if (item.value === null) {

                localStorage.removeItem(`${this._prefix}::${item.fieldName}`);

                delete queryString.values[item.fieldName];

            } else {

                localStorage.setItem(`${this._prefix}::${item.fieldName}`, item.value);

                queryString.values[item.fieldName] = item.value;
            }
        }

        queryString.apply();
    }

    getItem(fieldName: Extract<keyof T, string>): string | null {

        // Query string should take precedence
        const queryString = new QueryString();
        if (!!queryString.values[fieldName]) {
            return queryString.values[fieldName];
        }

        return localStorage.getItem(`${this._prefix}::${fieldName}`);
    }

    removeItem(fieldName: Extract<keyof T, string>) {

        localStorage.removeItem(`${this._prefix}::${fieldName}`);

        // Also dropping from query string
        const queryString = new QueryString();
        delete queryString.values[fieldName];
        queryString.apply();
    }
}
