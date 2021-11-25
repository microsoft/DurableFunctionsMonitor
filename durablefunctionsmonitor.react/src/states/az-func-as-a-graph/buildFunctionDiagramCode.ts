import { FunctionsMap, ProxiesMap } from './FunctionsMap';

const space = '#32;';

function getTriggerBindingText(binding: any): string {

    switch (binding.type) {
        case 'httpTrigger':
            return `${binding.authLevel === 'anonymous' ? '#127760;' : '#128274;'} http${!binding.methods ? '' : ':[' + binding.methods.join(',') + ']'}${!binding.route ? '' : ':' + binding.route}`;
        case 'blobTrigger':
            return `${space}blob:${binding.path ?? ''}`;
        case 'cosmosDBTrigger':
            return `${space}cosmosDB:${binding.databaseName ?? ''}:${binding.collectionName ?? ''}`;
        case 'eventHubTrigger':
            return `${space}eventHub:${binding.eventHubName ?? ''}`;
        case 'serviceBusTrigger':
            return `${space}serviceBus:${!binding.queueName ? (binding.topicName ?? '') : binding.queueName}${!binding.subscriptionName ? '' : ':' + binding.subscriptionName}`;
        case 'queueTrigger':
            return `${space}queue:${binding.queueName ?? ''}`;
        case 'timerTrigger':
            return `${space}timer:${binding.schedule ?? ''}`;
        default:
            return `${space}${binding.type}`;
    }
}

function getBindingText(binding: any): string {

    switch (binding.type) {
        case 'table':
            return `${space}table:${binding.tableName ?? ''}`;
        case 'blob':
            return `${space}blob:${binding.path ?? ''}`;
        case 'cosmosDB':
            return `${space}cosmosDB:${binding.databaseName ?? ''}:${binding.collectionName ?? ''}`;
        case 'eventHub':
            return `${space}eventHub:${binding.eventHubName ?? ''}`;
        case 'serviceBus':
            return `${space}serviceBus:${!binding.queueName ? (binding.topicName ?? '') : binding.queueName}${!binding.subscriptionName ? '' : ':' + binding.subscriptionName}`;
        case 'queue':
            return `${space}queue:${binding.queueName ?? ''}`;
        default:
            return `${space}${binding.type}`;
    }
}

export type GraphSettings = {
    doNotRenderFunctions?: boolean,
    doNotRenderProxies?: boolean,
};

// Translates functions and their bindings into a Mermaid Flowchart diagram code
export function buildFunctionDiagramCode(functionsMap: FunctionsMap, proxiesMap: ProxiesMap, settings: GraphSettings = {}): string {

    var code = '';

    if (!settings.doNotRenderFunctions) {
        
        const functions = [];

        // Determine what kind of function this one is
        for (const name in functionsMap) {
            const func = functionsMap[name];
    
            var triggerBinding = undefined, inputBindings = [], outputBindings = [], otherBindings = [];
            var nodeCode = `${name}{{"${space}${name}"}}:::function`;
    
            for (const binding of func.bindings) {
    
                if (binding.type === 'orchestrationTrigger') {
                    nodeCode = `${name}[["${space}${name}"]]:::orchestrator`;
                } else if (binding.type === 'activityTrigger') {
                    nodeCode = `${name}[/"${space}${name}"/]:::activity`;
                } else if (binding.type === 'entityTrigger') {
                    nodeCode = `${name}[("${space}${name}")]:::entity`;
                }
    
                if (binding.type.endsWith('Trigger')) {
                    triggerBinding = binding;
                } else if (binding.direction === 'in') {
                    inputBindings.push(binding);
                } else if (binding.direction === 'out') {
                    outputBindings.push(binding);
                } else {
                    otherBindings.push(binding);
                }
            }
    
            functions.push({ name, nodeCode, triggerBinding, inputBindings, outputBindings, otherBindings, ...func });
        }
    
        // Sorting by trigger type, then by name. Moving the ones that are being called to the bottom.
        const getFunctionHash = (f) => {
    
            var hash = (!!f.isCalledBy?.length || !f.triggerBinding || !f.triggerBinding.type) ? '' : f.triggerBinding.type;
            hash += '~' + f.name;
            return hash;
        }
        functions.sort((f1, f2) => {
            
            var s1 = getFunctionHash(f1);
            var s2 = getFunctionHash(f2);
    
            return (s1 > s2) ? 1 : ((s2 > s1) ? -1 : 0);
        });
    
        // Rendering
        for (const func of functions) {
    
            code += `${func.nodeCode}\n`;
            // Making Functions nodes a bit darker
            code += `style ${func.name} fill:#D9D9FF,stroke-width:2px\n`;
    
            if (!!func.isCalledBy?.length) {
    
                for (const calledBy of func.isCalledBy) {
                    code += `${calledBy} ---> ${func.name}\n`;
                }
    
            } else if (!!func.triggerBinding) {
    
                code += `${func.name}.${func.triggerBinding.type}>"${getTriggerBindingText(func.triggerBinding)}"]:::${func.triggerBinding.type} --> ${func.name}\n`;
            }
    
            for (var i = 0; i < func.inputBindings.length; i++) {
                const inputBinding = func.inputBindings[i];
                code += `${func.name}.${i}.${inputBinding.type}(["${getBindingText(inputBinding)}"]):::${inputBinding.type} -.-> ${func.name}\n`;
            }
    
            for (var i = 0; i < func.outputBindings.length; i++) {
                const outputBinding = func.outputBindings[i];
                code += `${func.name} -.-> ${func.name}.${i}.${outputBinding.type}(["${getBindingText(outputBinding)}"]):::${outputBinding.type}\n`;
            }
    
            for (var i = 0; i < func.otherBindings.length; i++) {
                const otherBinding = func.otherBindings[i];
                code += `${func.name} -.- ${func.name}.${i}.${otherBinding.type}(["${getBindingText(otherBinding)}"]):::${otherBinding.type}\n`;
            }
    
            if (!!func.isSignalledBy?.length) {
    
                for (const signalledBy of func.isSignalledBy) {
                    code += `${signalledBy.name} -- "#9889; ${signalledBy.signalName}" ---> ${func.name}\n`;
                }
            }
    
            if (!!func.isCalledByItself) {
    
                code += `${func.name} -- "[ContinueAsNew]" --> ${func.name}\n`;
            }
        }
    }

    // Also proxies
    if (!settings.doNotRenderProxies && (Object.keys(proxiesMap).length > 0)) {
        
        const proxyNodesColor = '#FFE6C8';

        var nodeTitle = ``;
        var notAddedToCsProjFile = false;

        for (const name in proxiesMap) {
            const proxy = proxiesMap[name];
            const proxyPurifiedName = name.replace(/ /g, '');

            notAddedToCsProjFile = proxy.warningNotAddedToCsProjFile;

            nodeTitle = '';
            if (!!proxy.matchCondition) {
                
                if (!!proxy.matchCondition.methods && !!proxy.matchCondition.methods.length) {
                    nodeTitle += (!!nodeTitle ? ':' : '') + `[${proxy.matchCondition.methods.join(',')}]`;
                }

                if (!!proxy.matchCondition.route) {
                    nodeTitle += (!!nodeTitle ? ':' : '') + proxy.matchCondition.route;
                }
            }
            if (!nodeTitle) {
                nodeTitle = name;
            }

            var nodeName = `proxy.${proxyPurifiedName}`;

            code += `proxies.json -. "${name}" .-> ${nodeName}(["${space}${nodeTitle}"]):::proxy\n`;
            code += `style ${nodeName} fill:${proxyNodesColor}\n`;

            if (!!proxy.backendUri) {

                nodeTitle = proxy.backendUri.replace(/'response./g, `'`);

                const nextNodeName = `proxy.${proxyPurifiedName}.backendUri`;

                code += `${nodeName} ${getRequestOverridesArrowCode(proxy.requestOverrides)} ${nextNodeName}["${space}${nodeTitle}"]:::http\n`;
                code += `style ${nextNodeName} fill:${proxyNodesColor}\n`;

                nodeName = nextNodeName;
            }

            const nextNodeName = `proxy.${proxyPurifiedName}.response`;

            code += `${nodeName} ${getResponseOverridesArrowCode(proxy.responseOverrides)} ${nextNodeName}(["${space}."]):::http\n`;
            code += `style ${nextNodeName} fill:${proxyNodesColor}\n`;
        }

        nodeTitle = `proxies.json`;
        var nodeColor = proxyNodesColor;
        if (notAddedToCsProjFile) {
            nodeTitle += ` #9888; Not added to .CSPROJ file!`;
            nodeColor = `#FF8080`;
        }

        code += `proxies.json["${space}${nodeTitle}"]\n`;
        code += `style proxies.json fill:${nodeColor}\n`;
    }

    return code;
}

const maxSymbolsInTitle = 150;

function getRequestOverridesArrowCode(requestOverrides: any): string {

    if (!requestOverrides) {
        return `-->`
    }

    var arrowText = JSON.stringify(requestOverrides)
        .replace(/"/g, `'`)
        .replace(/'backend.request./g, `'`);
    
    if (arrowText.length > maxSymbolsInTitle) {
        arrowText = arrowText.substr(0, maxSymbolsInTitle) + '...';
    }

    return `-- "${arrowText}${space}" -->`;
}

function getResponseOverridesArrowCode(responseOverrides: any): string {

    if (!responseOverrides) {
        return `-->`
    }

    if (!!responseOverrides['response.body']) {
        responseOverrides['response.body'] = '...';
    }

    var arrowText = JSON.stringify(responseOverrides)
        .replace(/"/g, `'`)
        .replace(/'response./g, `'`);
    
    if (arrowText.length > maxSymbolsInTitle) {
        arrowText = arrowText.substr(0, maxSymbolsInTitle) + '...';
    }

    return `-- "${arrowText}${space}" -->`;
}