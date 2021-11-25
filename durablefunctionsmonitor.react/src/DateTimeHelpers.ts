import moment from 'moment';

export class DateTimeHelpers
{
    // This is the default range for @material-ui/pickers
    private static MinMoment = moment('1900-01-01');
    private static MaxMoment = moment('2100-01-01');

    public static isValidMoment(t: moment.Moment): boolean {
        return !!t && t.isValid() && t.isAfter(DateTimeHelpers.MinMoment) && t.isBefore(DateTimeHelpers.MaxMoment);
    }

    public static formatDuration(durationInMs: number): string {

        if (isNaN(durationInMs) || (durationInMs < 0)) {
            return '';
        }

        const days = Math.floor(durationInMs / 86400000);
        var c = 0;
        var result = '';

        if (days > 0) {
            result += days.toFixed(0) + 'd';
            ++c;
            durationInMs = durationInMs % 86400000;
        }

        const hours = Math.floor(durationInMs / 3600000);
        if (hours > 0) {
            result += hours.toFixed(0) + 'h';

            if (++c > 1) {
                return result;
            }

            durationInMs = durationInMs % 3600000;
        }

        const minutes = Math.floor(durationInMs / 60000);
        if (minutes > 0) {
            result += minutes.toFixed(0) + 'm';

            if (++c > 1) {
                return result;
            }

            durationInMs = durationInMs % 60000;
        }

        const seconds = Math.floor(durationInMs / 1000);
        if (seconds > 0) {
            result += seconds.toFixed(0) + 's';

            if (++c > 1) {
                return result;
            }

            durationInMs = durationInMs % 1000;
        }

        if (durationInMs > 0) {
            result += durationInMs.toFixed(0) + 'ms';
        }

        if (!result) {
            result = '0ms';
        }

        return result;
    }
}