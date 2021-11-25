import { ITypedLocalStorage } from './ITypedLocalStorage';

// A global variable declared in index.html and replaced by VsCode extension
declare const StateFromVsCode: {};

// Stores field values in VsCode
export class VsCodeTypedLocalStorage<T> implements ITypedLocalStorage<T>
{
    constructor(private _prefix: string, private _vsCodeApi: any) { 
        this._state = StateFromVsCode[this._prefix];
        if (!this._state) {
            this._state = {};
        }
    }

    setItem(fieldName: Extract<keyof T, string>, value: string) {

        this._state[fieldName] = value
        this.save();
    }

    setItems(items: { fieldName: Extract<keyof T, string>, value: string | null }[]) {

        for (const item of items) {

            if (item.value === null) {
                delete this._state[item.fieldName];
            } else {
                this._state[item.fieldName] = item.value;
            }
        }

        this.save();
    }

    getItem(fieldName: Extract<keyof T, string>): string | null {

        return this._state[fieldName];
    }

    removeItem(fieldName: Extract<keyof T, string>) {

        delete this._state[fieldName];
        this.save();
    }

    private readonly _state: any;

    private save(): void {
        this._vsCodeApi.postMessage({ method: 'PersistState', key: this._prefix, data: this._state });
    }
}
