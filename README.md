# sqlite-database

This package builds on [sqlite3](https://github.com/TryGhost/node-sqlite3). It provides a promise-based API for interacting with your sqlite database.

## Installation

Install this package with npm:
```bash
npm i sqlite-database
```

## Usage
```typescript
import { SqliteDatabase } from 'sqlite-database';

const db = new SqliteDatabase('path/to/db');

const users = await db.all('SELECT id, name FROM Users');
```

Add typings to `SELECT` queries:
```typescript
const users = await db.all<{ id: number, name: string }>('SELECT id, name FROM Users');  // `users` will be an array of the provided type
```
Works with both `.all` and `.get`.

### Query parameters
Use questions marks in your sql query to use variables:
```typescript
const comment = await db.get('SELECT * FROM Comments WHERE id = ?', [commentId]);
```
