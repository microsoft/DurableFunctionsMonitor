import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Does a git clone into a temp folder and returns info about that cloned code
export async function cloneFromGitHub(url: string): Promise<{gitTempFolder: string, projectFolder: string}> {

    var repoName = '', branchName = '', relativePath = '', gitTempFolder = '';

    var restOfUrl: string[] = [];
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

    // The provided URL might contain both branch name and relative path. The only way to separate one from another
    // is to repeatedly try cloning assumed branch names, until we finally succeed.
    for (var i = restOfUrl.length; i > 0; i--) {

        try {

            const assumedBranchName = restOfUrl.slice(0, i).join('/');
            execSync(`git clone ${url} --branch ${assumedBranchName}`, { cwd: gitTempFolder });

            branchName = assumedBranchName;
            relativePath = path.join(...restOfUrl.slice(i, restOfUrl.length));

            break;
        } catch {
            continue;
        }
    }

    if (!branchName) {

        // Just doing a normal git clone
        execSync(`git clone ${url}`, { cwd: gitTempFolder });
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

// Checks if the given folder looks like a .Net project
export async function isDotNetProjectAsync(projectFolder: string): Promise<boolean> {
    return (await fs.promises.readdir(projectFolder)).some(fn => {
        fn = fn.toLowerCase();
        return fn.endsWith('.sln') ||
            fn.endsWith('.fsproj') ||
            (fn.endsWith('.csproj') && fn !== 'extensions.csproj');
    });
}

// Complements regex's inability to keep up with nested brackets
export function getCodeInBrackets(str: string, startFrom: number, openingBracket: string, closingBracket: string, mustHaveSymbols: string = ''): string {

    var bracketCount = 0, openBracketPos = 0, mustHaveSymbolFound = !mustHaveSymbols;
    for (var i = startFrom; i < str.length; i++) {
        switch (str[i]) {
            case openingBracket:
                if (bracketCount <= 0) {
                    openBracketPos = i + 1;
                }
                bracketCount++;
                break;
            case closingBracket:
                bracketCount--;
                if (bracketCount <= 0 && mustHaveSymbolFound) {
                    return str.substring(startFrom, i + 1);
                }
                break;
        }

        if (bracketCount > 0 && mustHaveSymbols.includes(str[i])) {
            mustHaveSymbolFound = true;
        }
    }
    return '';
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

    static getCallActivityRegex(activityName: string): RegExp {
        return new RegExp(`(CallActivity|call_activity)[\\s\\w,\\.-<>\\[\\]\\(\\)\\?]*\\([\\s\\w\\.-]*["'\`]?${activityName}\\s*["'\`\\),]{1}`, 'i');
    }
}

// In .Net not all bindings are mentioned in function.json, so we need to analyze source code to extract them
export class DotNetBindingsParser {

    // Extracts additional bindings info from C#/F# source code
    static tryExtractBindings(funcCode: string): {type: string, direction: string}[] {

        const result: {type: string, direction: string}[] = [];

        if (!funcCode) {
            return result;
        }

        const regex = this.bindingAttributeRegex;
        var match: RegExpExecArray | null;
        while (!!(match = regex.exec(funcCode))) {

            const isReturn = !!match[2];

            const attributeName = match[3];
            const attributeCodeStartIndex = match.index + match[0].length - 1;
            const attributeCode = getCodeInBrackets(funcCode, attributeCodeStartIndex, '(', ')', '');

            this.isOutRegex.lastIndex = attributeCodeStartIndex + attributeCode.length;
            const isOut = !!this.isOutRegex.exec(funcCode);

            switch (attributeName) {
                case 'Blob': {
                    const binding: any = { type: 'blob', direction: isReturn || isOut ? 'out' : 'in' };

                    const paramsMatch = this.blobParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['path'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'Table': {
                    const binding: any = { type: 'table', direction: isReturn || isOut ? 'out' : 'in' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['tableName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'CosmosDB': {
                    const binding: any = { type: 'cosmosDB', direction: isReturn || isOut ? 'out' : 'in' };

                    const paramsMatch = this.cosmosDbParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['databaseName'] = paramsMatch[1];
                        binding['collectionName'] = paramsMatch[3];
                    }
                    result.push(binding);

                    break;
                }
                case 'SignalRConnectionInfo': {
                    const binding: any = { type: 'signalRConnectionInfo', direction: 'in' };

                    const paramsMatch = this.signalRConnInfoParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['hubName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventGrid': {
                    const binding: any = { type: 'eventGrid', direction: 'out' };

                    const paramsMatch = this.eventGridParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['topicEndpointUri'] = paramsMatch[1];
                        binding['topicKeySetting'] = paramsMatch[3];
                    }
                    result.push(binding);

                    break;
                }
                case 'EventHub': {
                    const binding: any = { type: 'eventHub', direction: 'out' };

                    const paramsMatch = this.eventHubParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['eventHubName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'Queue': {
                    const binding: any = { type: 'queue', direction: 'out' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'ServiceBus': {
                    const binding: any = { type: 'serviceBus', direction: 'out' };

                    const paramsMatch = this.singleParamRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[2];
                    }
                    result.push(binding);

                    break;
                }
                case 'SignalR': {
                    const binding: any = { type: 'signalR', direction: 'out' };

                    const paramsMatch = this.signalRParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['hubName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'RabbitMQ': {
                    const binding: any = { type: 'rabbitMQ', direction: 'out' };

                    const paramsMatch = this.rabbitMqParamsRegex.exec(attributeCode);
                    if (!!paramsMatch) {
                        binding['queueName'] = paramsMatch[1];
                    }
                    result.push(binding);

                    break;
                }
                case 'SendGrid': {
                    result.push({ type: 'sendGrid', direction: 'out' });
                    break;
                }
                case 'TwilioSms': {
                    result.push({ type: 'twilioSms', direction: 'out' });
                    break;
                }
            }
        }

        return result;
    }

    static readonly bindingAttributeRegex = new RegExp(`\\[(<)?\\s*(return:)?\\s*(\\w+)(Attribute)?\\s*\\(`, 'g');
    static readonly singleParamRegex = new RegExp(`("|nameof\\s*\\()?([\\w\\.-]+)`);
    static readonly eventHubParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly signalRParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly rabbitMqParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly blobParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly cosmosDbParamsRegex = new RegExp(`"([^"]+)"(.|\r|\n)+?"([^"]+)"`);
    static readonly signalRConnInfoParamsRegex = new RegExp(`"([^"]+)"`);
    static readonly eventGridParamsRegex = new RegExp(`"([^"]+)"(.|\r|\n)+?"([^"]+)"`);

    static readonly isOutRegex = new RegExp(`\\]\\s*(out |ICollector|IAsyncCollector).*?(,|\\()`, 'g');
}
