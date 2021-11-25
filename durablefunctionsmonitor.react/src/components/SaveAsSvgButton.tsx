import * as React from 'react';

import { Box, Button, Typography } from '@material-ui/core';

import SaveIcon from '@material-ui/icons/Save';

import { IBackendClient } from '../services/IBackendClient';

// A button to save something as an .SVG file
export class SaveAsSvgButton extends React.Component<{ svg: string, fileName: string, inProgress: boolean, backendClient: IBackendClient }> {

    render(): JSX.Element {

        if (this.props.backendClient.isVsCode) {

            return (
                <Button
                    variant="outlined"
                    color="default"
                    disabled={this.props.inProgress}
                    onClick={() => this.props.backendClient.call('SaveAs', this.props.fileName + '.svg', this.props.svg)}
                >
                    <SaveIcon />
                    <Box width={20} />
                    <Typography color="inherit">Save as .SVG</Typography>
                </Button>
            );

        } else {

            return (
                <Button
                    variant="outlined"
                    color="default"
                    disabled={this.props.inProgress}
                    href={URL.createObjectURL(new Blob([this.props.svg], { type: 'image/svg+xml' }))}
                    download={this.props.fileName + '.svg'}
                >
                    <SaveIcon />
                    <Box width={20} />
                    <Typography color="inherit">Save as .SVG</Typography>
                </Button>
            );
        }
    }
}

// Appends some styling to SVG code, so it can also be saved as file
export function getStyledSvg(svg: string): string {

    return svg.replace('</style>',
        '.note { stroke: none !important; fill: none !important; } ' +
        '.noteText { font-size: 9px !important; } ' +
        '.label > g > text { transform: translateX(25px); }' +
        '</style>'
    );
}
