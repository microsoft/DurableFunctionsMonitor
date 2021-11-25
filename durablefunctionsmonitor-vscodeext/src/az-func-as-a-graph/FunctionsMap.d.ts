
export type FunctionsMap = {
    [name: string]: {
        bindings: any[],
        isCalledBy: string[],
        isSignalledBy: { name: string, signalName: string }[],
        isCalledByItself?: boolean,
        filePath?: string,
        pos?: number,
        lineNr?: number
    }
};

export type ProxiesMap = {
    [name: string]: {
        matchCondition?: {
            methods?: string[];
            route?: string;
        };
        backendUri?: string;
        requestOverrides?: {};
        responseOverrides?: {};
        filePath?: string,
        pos?: number,
        lineNr?: number,
        warningNotAddedToCsProjFile?: boolean
    }
};

export type TraverseFunctionResult = {
    functions: FunctionsMap;
    proxies: ProxiesMap;
    tempFolders: string[];
    projectFolder: string;
};
