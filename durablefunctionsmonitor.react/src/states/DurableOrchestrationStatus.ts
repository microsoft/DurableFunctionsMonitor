// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// A DTO used by DurableOrchestrationStatus.historyEvents
export class HistoryEvent {
    Timestamp: string;
    EventType: string;
    EventId: number;
    Name: string;
    ScheduledTime: string;
    DurationInMs: number;
    SubOrchestrationId: string;
    Input: any;
    Result: any;
    Details: any;
}

// Extends HistoryEvent with history for a suborchestration
export class EventWithHistory extends HistoryEvent {
    history: EventWithHistory[];
}

// Could instead just iterate through field names of HistoryEvent, but reflection in TypeScript still looks tricky
export const HistoryEventFields = [
    'Timestamp',
    'EventType',
    'EventId',
    'Name',
    'ScheduledTime',
    'Input',
    'Result',
    'Details',
];

export const RuntimeStatuses = ['Completed', 'Running', 'Failed', 'Pending', 'Terminated', 'Canceled', 'ContinuedAsNew'] as const;
export type RuntimeStatus = typeof RuntimeStatuses[number];

export type EntityType = 'Orchestration' | 'DurableEntity';

export class EntityId {
    name: string;
    key: string;
}

// A DTO returned by DurableOrchestrationClient.getStatusAll()
export class DurableOrchestrationStatus {
    instanceId: string;
    parentInstanceId: string;
    name: string;
    entityId: EntityId;
    runtimeStatus: RuntimeStatus;
    entityType: EntityType;
    lastEvent: string;
    input: any;
    customStatus: string;
    output: any;
    createdTime: string;
    lastUpdatedTime: string;
    duration: number;
    tabTemplateNames?: string[];

    static getFunctionName(instance: DurableOrchestrationStatus): string {
        return instance.entityType === 'DurableEntity' ? instance.entityId.name : instance.name;
    }
}

// Could instead just iterate through field names of DurableOrchestrationStatus, but reflection in TypeScript still looks tricky
export const DurableOrchestrationStatusFields = [
    'instanceId',
    'parentInstanceId',
    'name',
    'createdTime',
    'lastUpdatedTime',
    'duration',
    'runtimeStatus',
    'lastEvent',
    'input',
    'output',
    'customStatus'
];