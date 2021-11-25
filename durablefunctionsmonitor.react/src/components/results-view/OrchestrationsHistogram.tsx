import * as React from 'react';
import { observer } from 'mobx-react';
import moment from 'moment';

import { FormHelperText, Link } from '@material-ui/core';

import { XYPlot, XAxis, YAxis, DiscreteColorLegend, VerticalRectSeries, Highlight } from 'react-vis';

import { ResultsHistogramTabState } from '../../states/results-view/ResultsHistogramTabState';
import { DfmContextType } from '../../DfmContext';
import { Theme } from '../../theme';

// Orchestrations histogram view
@observer
export class OrchestrationsHistogram extends React.Component<{ state: ResultsHistogramTabState }> {

    static contextType = DfmContextType;
    context!: React.ContextType<typeof DfmContextType>;

    render(): JSX.Element {

        const state = this.props.state;
        const typeNames = Object.keys(state.histograms).sort();

        return (<>

            <FormHelperText className="items-count-label">
                {`${state.numOfInstancesShown} items shown`}

                {state.zoomedIn && (<>

                    {', '}
                    <Link
                        color={Theme.palette.type === 'dark' ? 'inherit' : 'primary'} 
                        className="unhide-button"
                        component="button"
                        variant="inherit"
                        onClick={() => state.resetZoom()}
                    >
                        reset zoom (Ctrl+Z)
                        </Link>
                </>)}

            </FormHelperText>

            <XYPlot
                width={window.innerWidth - 40} height={window.innerHeight - 400}
                xType="time"
                stackBy="y"
                margin={{ left: 80, right: 10, top: 20 }}
            >
                {!!state.numOfInstancesShown && (
                    <YAxis tickTotal={7} />
                )}
                <XAxis tickTotal={7} tickFormat={t => this.formatTimeTick(t, state.timeRangeInMilliseconds)} />

                {typeNames.map(typeName => (<VerticalRectSeries
                    key={typeName}
                    stroke="white"
                    color={this.getColorCodeForInstanceType(typeName)}
                    data={state.histograms[typeName]}
                />))}

                {!!state.numOfInstancesShown && (

                    <Highlight
                        color="#829AE3"
                        drag
                        enableY={false}

                        onDragEnd={(area) => {
                            if (!!area) {
                                state.applyZoom(area.left, area.right);
                            }
                        }}
                    />
                )}

            </XYPlot>

            <DiscreteColorLegend
                className={'histogram-legend' + (Theme.palette.type === 'dark' ? ' histogram-legend-dark-mode' : '')}
                colors={typeNames.map(typeName => this.getColorCodeForInstanceType(typeName))}
                items={typeNames.map(typeName => `${typeName} (${state.counts[typeName]})`)}
                orientation="horizontal"
            />

        </>);
    }

    private getColorCodeForInstanceType(instanceType: string): string {

        // Taking hash out of input string (reversed, to make names like 'func1', 'func2' etc. look different)
        var hashCode = 0;
        for (var i = instanceType.length - 1; i >= 0; i--) {
            hashCode = ((hashCode << 5) - hashCode) + instanceType.charCodeAt(i);
            // Convert to positive 32-bit integer
            hashCode &= 0x7FFFFFFF;
        }

        // min 6 hex digits
        hashCode |= 0x100000;

        // Not too white
        hashCode &= 0xFFFFEF;

        return '#' + hashCode.toString(16);
    }

    private formatTimeTick(t: Date, timeRange: number) {

        const m = moment(t);

        if (!this.context.showTimeAsLocal) {
            m.utc();
        }

        if (timeRange > 5 * 86400 * 1000) {
            return m.format('YYYY-MM-DD');
        }

        if (timeRange > 86400 * 1000) {
            return m.format('YYYY-MM-DD HH:mm');
        }

        if (timeRange > 10000) {

            return m.second() === 0 ? m.format('HH:mm') : m.format('HH:mm:ss');
        }

        return (m.millisecond() === 0) ? m.format('HH:mm:ss') : m.format(':SSS');
    }
}