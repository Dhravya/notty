use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub folder_id: Option<String>,
    pub sync_mode: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: String,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct Database(pub Mutex<Connection>);

impl Database {
    pub fn new(app_dir: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(app_dir.join("notty.db"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT 'Untitled',
                content TEXT NOT NULL DEFAULT '',
                yjs_state BLOB,
                created_at INTEGER NOT NULL DEFAULT (unixepoch()),
                updated_at INTEGER NOT NULL DEFAULT (unixepoch())
            );
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#8A8473',
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER DEFAULT (unixepoch()),
                updated_at INTEGER DEFAULT (unixepoch())
            );",
        )?;
        // Migrations
        let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN folder_id TEXT");
        let _ = conn.execute_batch("ALTER TABLE notes ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'cloud'");
        let _ = conn.execute_batch("ALTER TABLE folders ADD COLUMN description TEXT NOT NULL DEFAULT ''");
        Ok(Database(Mutex::new(conn)))
    }
}

#[tauri::command]
pub fn get_notes(db: tauri::State<Database>) -> Result<Vec<Note>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, content, folder_id, sync_mode, created_at, updated_at FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let notes = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                folder_id: row.get(3)?,
                sync_mode: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|n| n.ok())
        .collect();
    Ok(notes)
}

#[tauri::command]
pub fn get_note(db: tauri::State<Database>, id: String) -> Result<Option<Note>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, content, folder_id, sync_mode, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    let note = stmt
        .query_row(params![id], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                folder_id: row.get(3)?,
                sync_mode: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .ok();
    Ok(note)
}

#[tauri::command]
pub fn save_note(
    db: tauri::State<Database>,
    id: String,
    title: String,
    content: String,
    folder_id: Option<String>,
    sync_mode: Option<String>,
) -> Result<Note, String> {
    let sync_mode = sync_mode.unwrap_or_else(|| "cloud".to_string());
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes (id, title, content, folder_id, sync_mode, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, folder_id = excluded.folder_id, sync_mode = excluded.sync_mode, updated_at = unixepoch()",
        params![id, title, content, folder_id, sync_mode],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, title, content, folder_id, sync_mode, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![id], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            folder_id: row.get(3)?,
            sync_mode: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(db: tauri::State<Database>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_folders(db: tauri::State<Database>) -> Result<Vec<Folder>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, color, description, sort_order, created_at, updated_at FROM folders ORDER BY sort_order")
        .map_err(|e| e.to_string())?;
    let folders = stmt
        .query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                description: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|f| f.ok())
        .collect();
    Ok(folders)
}

#[tauri::command]
pub fn save_folder(
    db: tauri::State<Database>,
    id: String,
    name: String,
    color: Option<String>,
    description: Option<String>,
    sort_order: Option<i64>,
) -> Result<(), String> {
    let color = color.unwrap_or_else(|| "#8A8473".to_string());
    let description = description.unwrap_or_default();
    let sort_order = sort_order.unwrap_or(0);
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO folders (id, name, color, description, sort_order, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, unixepoch())
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, description = excluded.description, sort_order = excluded.sort_order, updated_at = unixepoch()",
        params![id, name, color, description, sort_order],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_folder(db: tauri::State<Database>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE notes SET folder_id = NULL WHERE folder_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
