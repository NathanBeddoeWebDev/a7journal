import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
        public_id TEXT,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
`);

const ensurePublicIdColumn = () => {
    const columns = db
        .prepare("PRAGMA table_info(entries)")
        .all()
        .map((column) => column.name);

    if (!columns.includes("public_id")) {
        db.exec("ALTER TABLE entries ADD COLUMN public_id TEXT");
    }

    db.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS entries_public_id_idx ON entries(public_id)"
    );
};

const generatePublicId = () => crypto.randomBytes(12).toString("hex");

const backfillPublicIds = () => {
    const missing = db
        .prepare(
            "SELECT id FROM entries WHERE public_id IS NULL OR public_id = ''"
        )
        .all();

    if (!missing.length) {
        return;
    }

    const update = db.prepare(
        "UPDATE entries SET public_id = ? WHERE id = ?"
    );

    for (const row of missing) {
        let updated = false;

        while (!updated) {
            const publicId = generatePublicId();

            try {
                update.run(publicId, row.id);
                updated = true;
            } catch (error) {
                if (!String(error).includes("entries_public_id_idx")) {
                    throw error;
                }
            }
        }
    }
};

ensurePublicIdColumn();
backfillPublicIds();

export const createEntry = (sessionId, body) => {
    const statement = db.prepare(
        "INSERT INTO entries (session_id, public_id, body, created_at) VALUES (?, ?, ?, ?)"
    );
    statement.run(sessionId, generatePublicId(), body, new Date().toISOString());
};

export const listEntries = (sessionId) => {
    const statement = db.prepare(
        "SELECT public_id, body, created_at FROM entries WHERE session_id = ? ORDER BY created_at DESC, id DESC"
    );
    return statement.all(sessionId);
};

export const getEntry = (sessionId, publicId) => {
    const statement = db.prepare(
        "SELECT id, public_id, body, created_at FROM entries WHERE session_id = ? AND public_id = ?"
    );
    return statement.get(sessionId, publicId);
};

export const getEntryNeighbors = (sessionId, publicId) => {
    const current = getEntry(sessionId, publicId);

    if (!current) {
        return { prevPublicId: null, nextPublicId: null };
    }

    const nextStatement = db.prepare(
        "SELECT public_id FROM entries WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT 1"
    );
    const prevStatement = db.prepare(
        "SELECT public_id FROM entries WHERE session_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT 1"
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
        prevPublicId: prev?.public_id ?? null,
        nextPublicId: next?.public_id ?? null,
    };
};
