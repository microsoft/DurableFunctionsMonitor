import { observable, computed } from 'mobx'
import moment from 'moment';

import { DateTimeHelpers } from '../../DateTimeHelpers';
import { IBackendClient } from '../../services/IBackendClient';
import { RuntimeStatus, EntityType } from '../DurableOrchestrationStatus';
import { ErrorMessageState } from '../ErrorMessageState';

// State of Purge History Dialog
export class PurgeHistoryDialogState extends ErrorMessageState {

    @computed
    get dialogOpen(): boolean { return this._dialogOpen; };
    set dialogOpen(value: boolean) {
        this._dialogOpen = value;

        if (value) {

            this._instancesDeleted = null;

            this.timeFrom = moment().subtract(1, 'days').utc();
            this.timeTill = moment().utc();

            this._statuses = new Set<RuntimeStatus>(["Completed", "Terminated"]);

            this.entityType = "Orchestration";
        }
    }

    @computed
    get instancesDeleted(): number | null { return this._instancesDeleted; };

    @computed
    get inProgress(): boolean { return this._inProgress; };

    @computed
    get isValid(): boolean {
        return this._statuses.size > 0 && DateTimeHelpers.isValidMoment(this.timeFrom) && DateTimeHelpers.isValidMoment(this.timeTill);
    };

    constructor(private _backendClient: IBackendClient) {
        super();
    }

    purgeHistory() {

        this._inProgress = true;

        this._backendClient.call('POST', '/purge-history', {
            entityType: this.entityType,
            timeFrom: this.timeFrom.toISOString(),
            timeTill: this.timeTill.toISOString(),
            statuses: Array.from(this._statuses.values())
        }).then(response => {

            this._instancesDeleted = response.instancesDeleted;

        }, err => this.showError('Purge history failed', err))
        .finally(() => {
            this._inProgress = false;
        });
    }

    @observable
    timeFrom: moment.Moment;
    @observable
    timeTill: moment.Moment;

    @observable
    entityType: EntityType = "Orchestration";

    getStatusIncluded(status: RuntimeStatus) {
        return this._statuses.has(status);
    }

    setStatusIncluded(status: RuntimeStatus, included: boolean) {
        if (included) {
            this._statuses.add(status);
        } else {
            this._statuses.delete(status);
        }
    }

    @observable
    private _statuses: Set<RuntimeStatus> = new Set<RuntimeStatus>();

    @observable
    private _dialogOpen: boolean = false;
    
    @observable
    private _inProgress: boolean = false;

    @observable
    private _instancesDeleted: number | null = null;
}