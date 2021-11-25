
import { Settings } from './Settings';

export class ConnStringUtils {
    
    // Extracts AccountName from Storage Connection String
    static GetAccountName(connString: string): string {
        const match = /AccountName=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts AccountKey from Storage Connection String
    static GetAccountKey(connString: string): string {
        const match = /AccountKey=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts DefaultEndpointsProtocol from Storage Connection String
    static GetDefaultEndpointsProtocol(connString: string): string {
        const match = /DefaultEndpointsProtocol=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : 'https';
    }

    // Extracts TableEndpoint from Storage Connection String
    static GetTableEndpoint(connString: string): string {

        const accountName = ConnStringUtils.GetAccountName(connString);
        if (!accountName) {
            return '';
        }

        const endpointsProtocol = ConnStringUtils.GetDefaultEndpointsProtocol(connString);

        const suffixMatch = /EndpointSuffix=([^;]+)/i.exec(connString);
        if (!!suffixMatch && suffixMatch.length > 0) {

            return `${endpointsProtocol}://${accountName}.table.${suffixMatch[1]}/`;
        }

        const endpointMatch = /TableEndpoint=([^;]+)/i.exec(connString);
        return (!!endpointMatch && endpointMatch.length > 0) ? endpointMatch[1] : `${endpointsProtocol}://${accountName}.table.core.windows.net/`;
    }

    // Replaces 'UseDevelopmentStorage=true' with full Storage Emulator connection string
    static ExpandEmulatorShortcutIfNeeded(connString: string): string {

        if (connString.includes('UseDevelopmentStorage=true')) {
            return Settings().storageEmulatorConnectionString;
        }

        return connString;
    }

    // Extracts server name from MSSQL Connection String
    static GetSqlServerName(connString: string): string {
        const match = /(Data Source|Server)=([^;]+)/i.exec(connString);
        return (!!match && match.length > 1) ? match[2] : '';
    }
    
    // Extracts database name from MSSQL Connection String
    static GetSqlDatabaseName(connString: string): string {
        const match = /Initial Catalog=([^;]+)/i.exec(connString);
        return (!!match && match.length > 0) ? match[1] : '';
    }

    // Extracts human-readable storage name from a bunch of connection strings
    static GetStorageName(connStrings: string[]): string {

        const serverName = this.GetSqlServerName(connStrings[0]);

        if (!serverName) {
            return this.GetAccountName(connStrings[0]);
        }

        const dbName = this.GetSqlDatabaseName(connStrings[0]);

        return serverName + (!dbName ? '' : '/' + dbName);
    }
}