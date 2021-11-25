
// Interface for pesristing class field values in some storage
export interface ITypedLocalStorage<T>
{
    setItem(fieldName: Extract<keyof T, string>, value: string): void;

    setItems(items: { fieldName: Extract<keyof T, string>, value: string | null}[]): void;
    
    getItem(fieldName: Extract<keyof T, string>): string | null;

    removeItem(fieldName: Extract<keyof T, string>): void;
}