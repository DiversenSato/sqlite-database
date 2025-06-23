import sqlite3 from 'sqlite3';
const sqlite = sqlite3.verbose();

interface RunResult {
    lastID: number;
    changes: number;
}

interface PragmaTable {
    schema: string;
    name: string;
    type: 'table';
    ncol: number;
    wr: number;
    strict: 0 | 1;
}

interface ColumnInfo {
    cid: number;
    name: string;
    type: string;
    notnull: 0 | 1;
    dflt_value: string | number | null;
    pk: 0 | 1;
}
type DataValue = string | number | boolean | null | undefined;

export enum DataTypes {
    INTEGER = 'INTEGER',
    REAL = 'REAL',
    TEXT = 'TEXT',
}

export enum ForeignKeyAction {
    NO_ACTION = 'NO ACTION',
    RESTRICT = 'RESTRICT',
    SET_NULL = 'SET NULL',
    SET_DEFAULT = 'SET DEFAULT',
    CASCADE = 'CASCADE',
}

interface ColumnCreationOptions {
    type: DataTypes;
    primaryKey?: boolean;
    autoIncrement?: boolean;
    references?: {
        table: string;
        key: string;
        onUpdate?: ForeignKeyAction;
        onDelete?: ForeignKeyAction;
    };
    allowNull?: boolean;
    unique?: boolean;
    default?: number | string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableCreationOptions<TAttributes = any> = {
    [name in keyof TAttributes]: ColumnCreationOptions;
};

export class SqliteDatabase {
    private con: sqlite3.Database;

    constructor(dbPathName: string) {
        this.con = new sqlite.Database(dbPathName, (err) => {
            if (err) throw err;
        });
    }

    run(sql: string, params?: DataValue[]): Promise<RunResult> {
        return new Promise((resolve, reject) => {
            this.con.run(sql, params, function (err: Error | null) {
                if (err) return reject(err);

                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    get<T = unknown>(sql: string, params?: DataValue[]): Promise<T | null> {
        return new Promise((resolve, reject) => {
            this.con.get(sql, params, (err: Error | null, row: T | null) => {
                if (err) return reject(err);

                resolve(row);
            });
        });
    }

    all<T = unknown>(sql: string, params?: DataValue[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.con.all(sql, params, (err: Error | null, rows: T[]) => {
                if (err) return reject(err);

                resolve(rows);
            });
        });
    }

    each<T = unknown>(sql: string, params: DataValue[], callback: (row: T) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            this.con.each(sql, params, (err: Error | null, row: T) => {
                if (err) return reject(err);

                callback(row);
            }, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    async renameTable(tableName: string, newTableName: string) {
        await this.run(`ALTER TABLE ${tableName} RENAME TO ${newTableName};`);
    }

    async renameColumn(tableName: string, columnName: string, newColumnName: string) {
        await this.run(`ALTER TABLE ${tableName} RENAME COLUMN ${columnName} TO ${newColumnName};`);
    }

    async addColumn(tableName: string, columnName: string, options: ColumnCreationOptions) {
        await this.run(`ALTER TABLE ${tableName} ADD ${this.createColumnDefinition(columnName, options)}`);
    }

    async dropColumn(tableName: string, columnName: string) {
        await this.run(`ALTER TABLE ${tableName} DROP ${columnName};`);
    }

    async listTables(): Promise<PragmaTable[]> {
        return await this.all('PRAGMA table_list;');
    }

    async tableInfo(tableName: string): Promise<ColumnInfo[]> {
        return this.all(`PRAGMA table_info(${tableName});`);
    }

    async dropTable(tableName: string) {
        await this.run(`DROP TABLE ${tableName};`);
    }

    private createColumnDefinition(columnName: string, options: ColumnCreationOptions) {
        let sql = `${columnName} ${options.type}`;
        if (options.allowNull === false || options.primaryKey === true) sql += ' NOT NULL';
        if (options.unique === true) sql += ' UNIQUE';
        if (options.default !== undefined) sql += ` DEFAULT ${typeof options.default === 'string' ? `"${options.default}"` : options.default}`;
        if (options.references !== undefined) sql += ` REFERENCES ${options.references.table}(${options.references.key}) ON UPDATE ${options.references.onUpdate ?? ForeignKeyAction.CASCADE} ON DELETE ${options.references.onDelete ?? ForeignKeyAction.CASCADE}`;
        return sql;
    }

    async createTable(tableName: string, options: TableCreationOptions) {
        const existingTables = await this.listTables();
        if (existingTables.some(table => table.name === tableName)) {
            throw new Error(`Table ${tableName} already exists`);
        }

        const columns: string[] = [];

        for (const [key, option] of Object.entries(options)) {
            columns.push(this.createColumnDefinition(key, option));
        }

        const primaryKeys = Object.entries(options).filter(([_key, option]) => option.primaryKey === true).map(([key, option]) => ({ key, autoInc: option.autoIncrement }));
        if (primaryKeys.length > 1) columns.push(`PRIMARY KEY(${primaryKeys.map((t) => t.key).join(',')})`);
        else if (primaryKeys.length === 1) columns.push(`PRIMARY KEY(${primaryKeys[0].key}${primaryKeys[0].autoInc ? ' AUTOINCREMENT' : ''})`);

        await this.run(`CREATE TABLE ${tableName} (${columns.join(', ')});`);
    }
}
