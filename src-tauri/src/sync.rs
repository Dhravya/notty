use crate::db::Database;
use rusqlite::params;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

pub struct SyncDir(pub PathBuf);

#[tauri::command]
pub fn sync_to_markdown(
    db: tauri::State<Database>,
    sync_dir: tauri::State<SyncDir>,
) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let dir = &sync_dir.0;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    // Build folder_id -> name map
    let mut folder_stmt = conn
        .prepare("SELECT id, name FROM folders")
        .map_err(|e| e.to_string())?;
    let folders: HashMap<String, String> = folder_stmt
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut stmt = conn
        .prepare("SELECT id, title, content, folder_id FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let notes: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Clean up old flat files that should now be in subdirs
    for (id, _, _, _) in &notes {
        let old_flat = dir.join(format!("{}.md", id));
        if old_flat.exists() {
            let _ = fs::remove_file(&old_flat);
        }
    }

    let mut count = 0;
    for (id, _title, content, folder_id) in &notes {
        let folder_name = folder_id
            .as_ref()
            .and_then(|fid| folders.get(fid))
            .cloned()
            .unwrap_or_else(|| "Uncategorized".to_string());

        let sub_dir = dir.join(&folder_name);
        fs::create_dir_all(&sub_dir).map_err(|e| e.to_string())?;

        let markdown = json_to_markdown(content);
        let path = sub_dir.join(format!("{}.md", id));
        fs::write(&path, &markdown).map_err(|e| e.to_string())?;
        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub fn sync_from_markdown(
    db: tauri::State<Database>,
    sync_dir: tauri::State<SyncDir>,
) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let dir = &sync_dir.0;
    if !dir.exists() {
        return Ok(0);
    }

    let mut count = 0;

    // Scan subdirectories
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_dir() {
            let folder_name = path.file_name().unwrap().to_string_lossy().to_string();
            if folder_name.starts_with('.') {
                continue;
            }

            // Resolve or create folder (skip for "Uncategorized")
            let folder_id = if folder_name == "Uncategorized" {
                None
            } else {
                let existing: Option<String> = conn
                    .query_row(
                        "SELECT id FROM folders WHERE name = ?1",
                        params![folder_name],
                        |row| row.get(0),
                    )
                    .ok();

                let fid = match existing {
                    Some(id) => id,
                    None => {
                        let id = uuid::Uuid::new_v4().to_string();
                        conn.execute(
                            "INSERT INTO folders (id, name) VALUES (?1, ?2)",
                            params![id, folder_name],
                        )
                        .map_err(|e| e.to_string())?;
                        id
                    }
                };
                Some(fid)
            };

            count += import_md_files(&conn, &path, &folder_id)?;
        } else {
            // Handle flat .md files at root (legacy)
            if path.extension().map(|e| e == "md").unwrap_or(false) {
                count += import_single_md(&conn, &path, &None)?;
            }
        }
    }

    Ok(count)
}

fn import_md_files(
    conn: &rusqlite::Connection,
    dir: &std::path::Path,
    folder_id: &Option<String>,
) -> Result<usize, String> {
    let mut count = 0;
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().map(|e| e == "md").unwrap_or(false) {
            count += import_single_md(conn, &path, folder_id)?;
        }
    }
    Ok(count)
}

fn import_single_md(
    conn: &rusqlite::Connection,
    path: &std::path::Path,
    folder_id: &Option<String>,
) -> Result<usize, String> {
    let stem = path.file_stem().unwrap().to_string_lossy().to_string();
    if stem.starts_with('.') {
        return Ok(0);
    }

    let markdown = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let title = markdown
        .lines()
        .next()
        .unwrap_or("Untitled")
        .trim_start_matches('#')
        .trim()
        .to_string();

    conn.execute(
        "INSERT INTO notes (id, title, content, folder_id, updated_at) VALUES (?1, ?2, ?3, ?4, unixepoch())
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content, folder_id = excluded.folder_id, updated_at = unixepoch()",
        params![stem, title, markdown, folder_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(1)
}

fn json_to_markdown(content: &str) -> String {
    let json: serde_json::Value = match serde_json::from_str(content) {
        Ok(v) => v,
        Err(_) => return content.to_string(),
    };

    let mut md = String::new();
    if let Some(nodes) = json.get("content").and_then(|c| c.as_array()) {
        for node in nodes {
            let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match node_type {
                "heading" => {
                    let level = node.get("attrs").and_then(|a| a.get("level")).and_then(|l| l.as_u64()).unwrap_or(1);
                    let prefix = "#".repeat(level as usize);
                    md.push_str(&format!("{} {}\n\n", prefix, extract_text(node)));
                }
                "paragraph" => {
                    md.push_str(&format!("{}\n\n", extract_text(node)));
                }
                "bulletList" => {
                    if let Some(items) = node.get("content").and_then(|c| c.as_array()) {
                        for item in items { md.push_str(&format!("- {}\n", extract_text(item))); }
                        md.push('\n');
                    }
                }
                "orderedList" => {
                    if let Some(items) = node.get("content").and_then(|c| c.as_array()) {
                        for (i, item) in items.iter().enumerate() { md.push_str(&format!("{}. {}\n", i + 1, extract_text(item))); }
                        md.push('\n');
                    }
                }
                "blockquote" => {
                    for line in extract_text(node).lines() { md.push_str(&format!("> {}\n", line)); }
                    md.push('\n');
                }
                "codeBlock" => {
                    md.push_str(&format!("```\n{}\n```\n\n", extract_text(node)));
                }
                "horizontalRule" => md.push_str("---\n\n"),
                _ => {
                    let text = extract_text(node);
                    if !text.is_empty() { md.push_str(&format!("{}\n\n", text)); }
                }
            }
        }
    }
    md.trim_end().to_string()
}

fn extract_text(node: &serde_json::Value) -> String {
    if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
        return text.to_string();
    }
    if let Some(content) = node.get("content").and_then(|c| c.as_array()) {
        return content.iter().map(extract_text).collect::<Vec<_>>().join("");
    }
    String::new()
}
