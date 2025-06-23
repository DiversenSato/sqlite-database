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

    /**
     * Runs a SQL query against the database.
     * 
     * Use {@link SqliteDatabase.all} or {@link SqliteDatabase.get} for SELECT queries.
     * 
     * @param sql The SQL query to run
     * @param params Optional array of parameters to bind to the query
     * @returns {@link RunResult} An object containing the last inserted ID and the number of changes made by the query
     */
    run(sql: string, params?: DataValue[]): Promise<RunResult> {
        return new Promise((resolve, reject) => {
            this.con.run(sql, params, function (err: Error | null) {
                if (err) return reject(err);

                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    /**
     * Get a single row from the database.
     * @param sql The SQL query to execute
     * @param params Optional array of parameters to bind to the query
     * @returns `unknown` | `null` The first row of the result set, or `null` if no rows were returned
     */
    get<T = unknown>(sql: string, params?: DataValue[]): Promise<T | null> {
        return new Promise((resolve, reject) => {
            this.con.get(sql, params, (err: Error | null, row: T | null) => {
                if (err) return reject(err);

                resolve(row);
            });
        });
    }

    /**
     * Get all rows the query returns.
     * @param sql The SQL query to execute
     * @param params Optional array of parameters to bind to the query
     * @returns `unknown[]` | `T[]` An array of rows returned by the query, or an empty array if no rows were returned
     */
    all<T = unknown>(sql: string, params?: DataValue[]): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.con.all(sql, params, (err: Error | null, rows: T[]) => {
                if (err) return reject(err);

                resolve(rows);
            });
        });
    }

    /**
     * Run a callback for each row returned by the query.
     * @param sql The SQL query to execute
     * @param params Array of parameters to bind to the query. Use an empty array if no parameters are needed.
     * @param callback A callback function that will be called for each row returned by the query.
     * @returns `void`
     */
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

    /**
     * UNSAFE: This method does not escape the table name, which can lead to SQL injection vulnerabilities.
     * 
     * Renames an existing table.
     * Shorthand for `ALTER TABLE <tableName> RENAME TO <newTableName>`.
     * 
     * @param tableName The name of the table to rename
     * @param newTableName The new name for the table
     */
    async renameTable(tableName: string, newTableName: string) {
        await this.run(`ALTER TABLE ${tableName} RENAME TO ${newTableName};`);
    }

    /**
     * UNSAFE: This method does not escape the table- or column name, which can lead to SQL injection vulnerabilities.
     * 
     * Renames a column in an existing table.
     * Shorthand for `ALTER TABLE <tableName> RENAME COLUMN <columnName> TO <newColumnName>`.
     * 
     * @param tableName The name of the table containing the column to rename
     * @param columnName The name of the column to rename
     * @param newColumnName The new name for the column
     */
    async renameColumn(tableName: string, columnName: string, newColumnName: string) {
        await this.run(`ALTER TABLE ${tableName} RENAME COLUMN ${columnName} TO ${newColumnName};`);
    }

    /**
     * UNSAFE: This method does not escape the table- or column name, which can lead to SQL injection vulnerabilities.
     * 
     * Adds a new column to an existing table.
     * 
     * @param tableName The table to add the column to
     * @param columnName The name of the column to add
     * @param options Creation options for the column. Interface: {@link ColumnCreationOptions}
     */
    async addColumn(tableName: string, columnName: string, options: Omit<ColumnCreationOptions, 'primaryKey'>) {
        await this.run(`ALTER TABLE ${tableName} ADD ${this.createColumnDefinition(columnName, options)}`);
    }

    /**
     * UNSAFE: This method does not escape the table- or column name, which can lead to SQL injection vulnerabilities.
     * 
     * Drops a column from a table.
     * Shorthand for `ALTER TABLE <tableName> DROP <columnName>`.
     * 
     * @param tableName The name of the table from which to drop the column
     * @param columnName The name of the column to drop
     */
    async dropColumn(tableName: string, columnName: string) {
        await this.run(`ALTER TABLE ${tableName} DROP ${columnName};`);
    }

    /**
     * Lists all tables in the database.
     * Shorthand for `PRAGMA table_list;`.
     * 
     * @returns An array of {@link PragmaTable} objects, each representing a table in the database
     */
    async listTables(): Promise<PragmaTable[]> {
        return await this.all('PRAGMA table_list;');
    }

    /**
     * UNSAFE: This method does not escape the table name, which can lead to SQL injection vulnerabilities.
     * 
     * Retrieves information about the columns in a specified table.
     * Shorthand for `PRAGMA table_info(<tableName>)`.
     * 
     * @param tableName The name of the table to get information about
     * @returns An array of {@link ColumnInfo} objects, each representing a column in the table
     */
    async tableInfo(tableName: string): Promise<ColumnInfo[]> {
        return this.all(`PRAGMA table_info(${tableName});`);
    }

    /**
     * UNSAFE: This method does not escape the table name, which can lead to SQL injection vulnerabilities.
     * 
     * Drops a table from the database.
     * Shorthand for `DROP TABLE <tableName>`.
     * 
     * @param tableName The name of the table to drop
     */
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

    /**
     * 
     * @example
     * ```typescript
     * await db.createTable('Users', {
     *   id: {
     *     type: DataTypes.INTEGER,
     *     primaryKey: true,
     *     autoIncrement: true,
     *   },
     *   name: {
     *     type: DataTypes.TEXT,
     *     allowNull: false,
     *   },
     * });
     * ```
     * @param tableName The name of the table to create
     * @param options {@link TableCreationOptions} The options for the table creation, including column definitions
     */
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
