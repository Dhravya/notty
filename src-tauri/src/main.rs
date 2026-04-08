#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod sync;

use tauri::{Manager, Listener, Emitter};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("failed to get app dir");
            std::fs::create_dir_all(&app_dir).ok();

            let db = db::Database::new(&app_dir).expect("failed to init db");
            app.manage(db);

            let sync_dir = dirs::document_dir()
                .unwrap_or_else(|| app_dir.clone())
                .join("Notty");
            std::fs::create_dir_all(&sync_dir).ok();
            app.manage(sync::SyncDir(sync_dir));

            // Listen for deep link events (notty://auth?token=...)
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                if let Some(payload) = event.payload().strip_prefix('"').and_then(|s| s.strip_suffix('"')) {
                    // Emit to frontend so JS can handle the token exchange
                    let _ = handle.emit("auth-deep-link", payload);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_notes,
            db::get_note,
            db::save_note,
            db::move_note_to_folder,
            db::set_sync_mode,
            db::delete_note,
            db::get_folders,
            db::save_folder,
            db::delete_folder,
            sync::sync_to_markdown,
            sync::sync_from_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
