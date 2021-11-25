
// A DTO used by DurableOrchestrationStatus.historyEvents
export class HistoryEvent {
    Timestamp: string;
    EventType: string;
    EventId: number;
    Name: string;
    ScheduledTime: string;
    DurationInMs: number;
    SubOrchestrationId: string;
    Result: any;
    Details: any;
}

// Could instead just iterate through field names of HistoryEvent, but reflection in TypeScript still looks tricky
export const HistoryEventFields = [
    'Timestamp',
    'EventType',
    'EventId',
    'Name',
    'ScheduledTime',
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