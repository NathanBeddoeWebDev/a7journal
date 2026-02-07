import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "a7journal.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);

export const createEntry = (sessionId, body) => {
    const statement = db.prepare(
        "INSERT INTO entries (session_id, body, created_at) VALUES (?, ?, ?)"
    );
    statement.run(sessionId, body, new Date().toISOString());
};

export const listEntries = (sessionId) => {
    const statement = db.prepare(
        "SELECT id, body, created_at FROM entries WHERE session_id = ? ORDER BY created_at DESC"
    );
    return statement.all(sessionId);
};

export const getEntry = (sessionId, entryId) => {
    const statement = db.prepare(
        "SELECT id, body, created_at FROM entries WHERE session_id = ? AND id = ?"
    );
    return statement.get(sessionId, entryId);
};

export const getEntryNeighbors = (sessionId, entryId) => {
    const current = getEntry(sessionId, entryId);

    if (!current) {
        return { prevId: null, nextId: null };
    }

    const nextStatement = db.prepare(
        "SELECT id FROM entries WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT 1"
    );
    const prevStatement = db.prepare(
        "SELECT id FROM entries WHERE session_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 1"
    );

    const next = nextStatement.get(
        sessionId,
        current.created_at,
        current.created_at,
        current.id
    );
    const prev = prevStatement.get(
        sessionId,
        current.created_at,
        current.created_at,
        current.id
    );

    return {
        prevId: prev?.id ?? null,
        nextId: next?.id ?? null,
    };
};
