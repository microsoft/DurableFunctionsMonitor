// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { exec } from 'child_process';
const execAsync = util.promisify(exec);

const gitCloneTimeoutInSeconds = 60;

export const ExcludedFolders = ['node_modules', 'obj', '.vs', '.vscode', '.env', '.python_packages', '.git', '.github'];

// Does a git clone into a temp folder and returns info about that cloned code
export async function cloneFromGitHub(url: string): Promise<{gitTempFolder: string, projectFolder: string}> {

    let repoName = '', branchName = '', relativePath = '', gitTempFolder = '';

    let restOfUrl: string[] = [];
    const match = /(https:\/\/github.com\/.*?)\/([^\/]+)(\/tree\/)?(.*)/i.exec(url);

    if (!match || match.length < 5) {

        // expecting repo name to be the last segment of remote origin URL
        repoName = url.substr(url.lastIndexOf('/') + 1);

    } else {

        const orgUrl = match[1];

        repoName = match[2];
        if (repoName.toLowerCase().endsWith('.git')) {
            repoName = repoName.substr(0, repoName.length - 4);
        }

        url = `${orgUrl}/${repoName}.git`;

        if (!!match[4]) {
            restOfUrl = match[4].split('/').filter(s => !!s);
        }
    }

    gitTempFolder = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-clone-'));

    let getGitTimeoutPromise = () => {

        return new Promise<void>((resolve, reject) => setTimeout(() => reject(new Error(`git clone timed out after ${gitCloneTimeoutInSeconds} sec.`)), gitCloneTimeoutInSeconds * 1000));
    };

    // The provided URL might contain both branch name and relative path. The only way to separate one from another
    // is to repeatedly try cloning assumed branch names, until we finally succeed.
    for (let i = restOfUrl.length; i > 0; i--) {

        try {

            const assumedBranchName = restOfUrl.slice(0, i).join('/');

            const clonePromise = execAsync(`git clone ${url} --branch ${assumedBranchName}`, { cwd: gitTempFolder });
    
            // It turned out that the above command can hang forever for unknown reason. So need to put a timeout.
            await Promise.race([clonePromise, getGitTimeoutPromise()]);

            branchName = assumedBranchName;
            relativePath = path.join(...restOfUrl.slice(i, restOfUrl.length));

            break;
        } catch {
            continue;
        }
    }

    if (!branchName) {

        // Just doing a normal git clone
        const clonePromise = execAsync(`git clone ${url}`, { cwd: gitTempFolder });

        // It turned out that the above command can hang forever for unknown reason. So need to put a timeout.
        await Promise.race([clonePromise, getGitTimeoutPromise()]);
    }

    return { gitTempFolder, projectFolder: path.join(gitTempFolder, repoName, relativePath) };
}

// Primitive way of getting a line number out of symbol position
export function posToLineNr(code: string | undefined, pos: number): number {
    if (!code) {
        return 0;
    }
    const lineBreaks = code.substr(0, pos).match(/(\r\n|\r|\n)/g);
    return !lineBreaks ? 1 : lineBreaks.length + 1;
}

// Checks if the given folder looks like a .NET project
export async function isDotNetProjectAsync(projectFolder: string): Promise<boolean> {
    return (await fs.promises.readdir(projectFolder)).some(fn => {
        fn = fn.toLowerCase();
        return fn.endsWith('.sln') ||
            fn.endsWith('.fsproj') ||
            (fn.endsWith('.csproj') && fn !== 'extensions.csproj');
    });
}

// Checks if the given folder looks like a .NET Isolated project
export async function isDotNetIsolatedProjectAsync(projectFolder: string): Promise<boolean> {

    const csprojFile = (await fs.promises.readdir(projectFolder)).find(fn => {
        fn = fn.toLowerCase();
        return (fn.endsWith('.csproj') && fn !== 'extensions.csproj');
    });

    if (!csprojFile) {
        return false;
    }

    const csprojFileString = await fs.promises.readFile(path.join(projectFolder, csprojFile), { encoding: 'utf8' });

    return csprojFileString.includes('Microsoft.Azure.Functions.Worker');
}

// Checks if the given folder looks like a Java Functions project
export async function isJavaProjectAsync(projectFolder: string): Promise<boolean> {

    const javaFileMatch = await findFileRecursivelyAsync(projectFolder, `.+\\.java$`, false);
    return !!javaFileMatch;
}

// Complements regex's inability to keep up with nested brackets
export function getCodeInBrackets(str: string, startFrom: number, openingBracket: string, closingBracket: string, mustHaveSymbols: string = ''): { code: string, openBracketPos: number } {

    var bracketCount = 0, openBracketPos = -1, mustHaveSymbolFound = !mustHaveSymbols;

    for (var i = startFrom; i < str.length; i++) {

        switch (str[i]) {
            case openingBracket:

                if (bracketCount <= 0) {
                    openBracketPos = i;
                }
                bracketCount++;

                break;
            case closingBracket:

                bracketCount--;
                if (bracketCount <= 0 && mustHaveSymbolFound) {
                    return { code: str.substring(startFrom, i + 1), openBracketPos: openBracketPos - startFrom };
                }
                
                break;
        }

        if (bracketCount > 0 && mustHaveSymbols.includes(str[i])) {
            mustHaveSymbolFound = true;
        }
    }
    return { code: '', openBracketPos: -1 };
}

// Complements regex's inability to keep up with nested brackets
export function getCodeInBracketsReverse(str: string, openingBracket: string, closingBracket: string): { code: string, openBracketPos: number } {

    var bracketCount = 0, closingBracketPos = 0;
    
    for (var i = str.length - 1; i >= 0; i--) {

        switch (str[i]) {
            case closingBracket:

                if (bracketCount <= 0) {
                    closingBracketPos = i;
                }
                bracketCount++;

                break;
            case openingBracket:

                bracketCount--;
                if (bracketCount <= 0 ) {
                    return { code: str.substring(0, closingBracketPos + 1), openBracketPos: i };
                }
                
                break;
        }
    }
    return { code: '', openBracketPos: -1 };
}


// fileName can be a regex, pattern should be a regex (which will be searched for in the matching files).
// If returnFileContents == true, returns file content. Otherwise returns full path to the file.
export async function findFileRecursivelyAsync(folder: string, fileName: string | RegExp, returnFileContents: boolean, pattern?: RegExp)
    : Promise<{ filePath: string, code?: string, pos?: number, length?: number } | undefined> {

    const fileNameRegex = typeof fileName === 'string' ? new RegExp(fileName, 'i') : fileName;

    for (const name of await fs.promises.readdir(folder)) {
        var fullPath = path.join(folder, name);

        if ((await fs.promises.lstat(fullPath)).isDirectory()) {

            if (ExcludedFolders.includes(name.toLowerCase())) {
                continue;
            }

            const result = await findFileRecursivelyAsync(fullPath, fileNameRegex, returnFileContents, pattern);
            if (!!result) {
                return result;
            }

        } else if (!!fileNameRegex.exec(name)) {

            if (!pattern) {
                return {
                    filePath: fullPath,
                    code: returnFileContents ? (await fs.promises.readFile(fullPath, { encoding: 'utf8' })) : undefined
                };
            }

            const code = await fs.promises.readFile(fullPath, { encoding: 'utf8' });
            const match = pattern.exec(code);

            if (!!match) {
                return {
                    filePath: fullPath,
                    code: returnFileContents ? code : undefined,
                    pos: match.index,
                    length: match[0].length
                };
            }
        }
    }

    return undefined;
}

// General-purpose regexes
export class TraversalRegexes {

    static getStartNewOrchestrationRegex(orchName: string): RegExp {
        return new RegExp(`(StartNew|StartNewAsync|start_new)(\\s*<[\\w\\.-\\[\\]\\<\\>,\\s]+>)?\\s*\\(\\s*(["'\`]|nameof\\s*\\(\\s*[\\w\\.-]*|[\\w\\s\\.]+\\.\\s*)${orchName}\\s*["'\\),]{1}`, 'i');
    }

    static getCallSubOrchestratorRegex(subOrchName: string): RegExp {
        return new RegExp(`(CallSubOrchestrator|CallSubOrchestratorWithRetry|call_sub_orchestrator)(Async)?(\\s*<[\\w\\.-\\[\\]\\<\\>,\\s]+>)?\\s*\\(\\s*(["'\`]|nameof\\s*\\(\\s*[\\w\\.-]*|[\\w\\s\\.]+\\.\\s*)${subOrchName}\\s*["'\\),]{1}`, 'i');
    }

    static readonly continueAsNewRegex = new RegExp(`ContinueAsNew\\s*\\(`, 'i');

    static getRaiseEventRegex(eventName: string): RegExp {
        return new RegExp(`(RaiseEvent|raise_event)(Async)?(.|\r|\n)*${eventName}`, 'i');
    }

    static getSignalEntityRegex(entityName: string): RegExp {
        return new RegExp(`${entityName}\\s*["'>]{1}`);
    }

    static readonly waitForExternalEventRegex = new RegExp(`(WaitForExternalEvent|wait_for_external_event)(<[\\s\\w,\\.-\\[\\]\\(\\)\\<\\>]+>)?\\s*\\(\\s*(nameof\\s*\\(\\s*|["'\`]|[\\w\\s\\.]+\\.\\s*)?([\\s\\w\\.-]+)\\s*["'\`\\),]{1}`, 'gi');

    static getDotNetFunctionNameRegex(funcName: string): RegExp {
        return new RegExp(`FunctionName(Attribute)?\\s*\\(\\s*(nameof\\s*\\(\\s*|["'\`]|[\\w\\s\\.]+\\.\\s*)${funcName}\\s*["'\`\\)]{1}`)
    }

    static getJavaFunctionNameRegex(funcName: string): RegExp {
        return new RegExp(`@\\s*FunctionName\\s*\\(["\\s\\w\\.-]*${funcName}"?\\)`)
    }

    static getCallActivityRegex(activityName: string): RegExp {
        return new RegExp(`(CallActivity|call_activity)[\\s\\w,\\.-<>\\[\\]\\(\\)\\?]*\\([\\s\\w\\.-]*["'\`]?${activityName}\\s*["'\`\\),]{1}`, 'i');
    }

    static getClassDefinitionRegex(className: string): RegExp {
        return new RegExp(`class\\s*${className}`)
    }
}

// In .Net not all bindings are mentioned in function.json, so we need to analyze source code to extract them
export class BindingsParser {

    // Extracts additional bindings info from C#/F# source code
    static tryExtractBindings(funcCode: string): {type: string, direction: string}[] {

        const result: {type: string, direction: string}[] = [];

        if (!funcCode) {
            return result;
        }

        const regex = this.bindingAttributeRegex;
        var match: RegExpExecArray | null;
        while (!!(match = regex.exec(funcCode))) {

            const isReturn = !!match[3];

            let attributeName = match[4];
            if (attributeName.endsWith(`Attribute`)) {
                attributeName = attributeName.substring(0, attributeName.length - `Attribute`.length);
            }

            const attributeCodeStartIndex = match.index + match[0].length;
            const attributeCode = getCodeInBrackets(funcCode, attributeCodeStartIndex, '(', ')', '').code;

            this.isOutRegex.lastIndex = attributeCodeStartIndex + attributeCode.length;
            const isOut = !!this.isOutRegex.exec(funcCode);

            switch (attributeName) {
                case 'BlobInput':
                case 'BlobOutput': 
                case 'Blob': {
                    const binding: any = {
                        type: 'blob',
                        direction: attributeName === 'Blob' ? (isReturn || isOut ? 'out' : 'in') : (attributeName === 'BlobOutput' ? 'out' : 'in')
                    };

                    const paramsMatch = this.blobParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.path = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'BlobTrigger': {
                    const binding: any = { type: 'blobTrigger' };

                    const paramsMatch = this.blobParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.path = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'TableInput':
                case 'TableOutput': 
                case 'Table': {
                    const binding: any = {
                        type: 'table',
                        direction: attributeName === 'Table' ? (isReturn || isOut ? 'out' : 'in') : (attributeName === 'TableOutput' ? 'out' : 'in')
                    };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.tableName = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'CosmosDBInput': 
                case 'CosmosDBOutput': 
                case 'CosmosDB': {
                    const binding: any = {
                        type: 'cosmosDB',
                        direction: attributeName === 'CosmosDB' ? (isReturn || isOut ? 'out' : 'in') : (attributeName === 'CosmosDBOutput' ? 'out' : 'in')
                    };

                    const paramsMatch = this.cosmosDbParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.databaseName = paramsMatch[1];
                        binding.collectionName = paramsMatch[3];
                    }
                    result.push(binding);

                    break;
                }
                case 'CosmosDBTrigger': {
                    const binding: any = { type: 'cosmosDBTrigger' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.databaseName = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventGrid': 
                case 'EventGridOutput': {
                    const binding: any = { type: 'eventGrid', direction: 'out' };

                    const paramsMatch = this.eventGridParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.topicEndpointUri = paramsMatch[1];
                        binding.topicKeySetting = paramsMatch[3];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventGridTrigger': {
                    const binding: any = { type: 'eventGridTrigger' };

                    const paramsMatch = this.eventGridParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.topicEndpointUri = paramsMatch[1];
                        binding.topicKeySetting = paramsMatch[3];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventHub': 
                case 'EventHubOutput': {
                    const binding: any = { type: 'eventHub', direction: 'out' };

                    const paramsMatch = this.eventHubParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.eventHubName = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventHubTrigger': {
                    const binding: any = { type: 'eventHubTrigger' };

                    const paramsMatch = this.eventHubParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.eventHubName = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'Kafka': 
                case 'KafkaOutput': {
                    const binding: any = { type: 'kafka', direction: 'out' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.brokerList = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'KafkaTrigger': {
                    const binding: any = { type: 'kafkaTrigger' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.brokerList = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'Queue': 
                case 'QueueOutput': {
                    const binding: any = { type: 'queue', direction: 'out' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'QueueTrigger': {
                    const binding: any = { type: 'queueTrigger' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'ServiceBus': 
                case 'ServiceBusOutput': {
                    const binding: any = { type: 'serviceBus', direction: 'out' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'ServiceBusTrigger': 
                case 'ServiceBusQueueTrigger': 
                case 'ServiceBusTopicTrigger': {
                    const binding: any = { type: 'serviceBusTrigger' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'SignalRConnectionInfo': 
                case 'SignalRConnectionInfoInput': {
                    const binding: any = { type: 'signalRConnectionInfo', direction: 'in' };

                    const paramsMatch = this.signalRConnInfoParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding.hubName = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'SignalR': 
                case 'SignalROutput': {
                    const binding: any = { type: 'signalR', direction: 'out' };

                    const paramsMatch = this.signalRParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['hubName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'SignalRTrigger': {
                    const binding: any = { type: 'signalRTrigger' };

                    const paramsMatch = this.signalRParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['hubName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'RabbitMQ': 
                case 'RabbitMQOutput': {
                    const binding: any = { type: 'rabbitMQ', direction: 'out' };

                    const paramsMatch = this.rabbitMqParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'RabbitMQTrigger': {
                    const binding: any = { type: 'rabbitMQTrigger' };

                    const paramsMatch = this.rabbitMqParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'SendGrid': 
                case 'SendGridOutput': {
                    result.push({ type: 'sendGrid', direction: 'out' });
                    break;
                }
                case 'TwilioSms': {
                    result.push({ type: 'twilioSms', direction: 'out' });
                    break;
                }
                case 'HttpTrigger': {
                    const binding: any = { type: 'httpTrigger', methods: [] };

                    const httpTriggerRouteMatch = this.httpTriggerRouteRegex.exec(attributeCode);
                    if (!!httpTriggerRouteMatch) {
                        binding.route = httpTriggerRouteMatch[1];
                    }

                    const lowerAttributeCode = attributeCode.toLowerCase();
                    for (const httpMethod of this.httpMethods) {
                        
                        if (lowerAttributeCode.includes(`"${httpMethod}"`)) {
                            
                            binding.methods.push(httpMethod);
                        }
                    }

                    result.push(binding);

                    result.push({ type: 'http', direction: 'out' });

                    break;
                }
                case 'DurableOrchestrationTrigger': {
                    result.push({ type: 'orchestrationTrigger', direction: 'in' });
                    break;
                }
                case 'DurableActivityTrigger': {
                    result.push({ type: 'activityTrigger', direction: 'in' });
                    break;
                }
                case 'DurableEntityTrigger': {
                    result.push({ type: 'entityTrigger', direction: 'in' });
                    break;
                }
            }
        }

        return result;
    }

    static readonly bindingAttributeRegex = new RegExp(`(\\[|@)(<)?\\s*(return:)?\\s*(\\w+)`, 'g');
    static readonly singleParamRegex = new RegExp(`("|nameof\\s*\\()?([\\w\\.-]+)`);
    static readonly eventHubParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly signalRParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly rabbitMqParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly blobParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly cosmosDbParamsRegex = new RegExp(`"([^"]+)"(.|\r|\n)+?"([^"]+)"`);
    static readonly signalRConnInfoParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly eventGridParamsRegex = new RegExp(`"([^"]+)"(.|\r|\n)+?"([^"]+)"`);

    static readonly isOutRegex = new RegExp(`^\\s*\\]\\s*(out |ICollector|IAsyncCollector).*?(,|\\()`, 'g');

    static readonly httpMethods = [`get`, `head`, `post`, `put`, `delete`, `connect`, `options`, `trace`, `patch`];
    static readonly httpTriggerRouteRegex = new RegExp(`Route\\s*=\\s*"(.*)"`);

    static readonly functionAttributeRegex = new RegExp(`\\[\\s*Function(Attribute)?\\s*\\((["\\w\\s\\.\\(\\)-]+)\\)\\s*\\]`, 'g');
    static readonly functionReturnTypeRegex = new RegExp(`public\\s*(static\\s*|async\\s*)*(Task\\s*<\\s*)?([\\w\\.]+)`);

    static readonly javaFunctionAttributeRegex = new RegExp(`@\\s*FunctionName\\s*\\((["\\w\\s\\.\\(\\)-]+)\\)`, 'g');
}
