#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod sync;

use tauri::{Manager, Listener, Emitter, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[tauri::command]
fn open_note_in_main(app: tauri::AppHandle, note_id: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
        // Use history.pushState + popstate to trigger React Router navigation
        win.eval(&format!(
            "history.pushState(null, '', '/note/{}'); window.dispatchEvent(new PopStateEvent('popstate'));",
            note_id
        )).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Main window not found".into())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
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
            // Payload is a JSON array of URLs: ["notty://auth?token=xxx"]
            let handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(event.payload()) {
                    if let Some(url) = urls.first() {
                        let _ = handle.emit("auth-deep-link", url.as_str());
                    }
                }
            });

            // Global shortcut: Cmd+Option+N → toggle quick note window
            let handle = app.handle().clone();
            let shortcut: Shortcut = "CmdOrCtrl+Alt+N".parse().expect("invalid shortcut");
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                if event.state != ShortcutState::Pressed { return; }

                if let Some(win) = handle.get_webview_window("quick-note") {
                    if win.is_visible().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                } else {
                    let _ = WebviewWindowBuilder::new(
                        &handle,
                        "quick-note",
                        tauri::WebviewUrl::App("/quick-note".into()),
                    )
                    .title("Quick Note")
                    .inner_size(420.0, 340.0)
                    .resizable(true)
                    .always_on_top(true)
                    .decorations(false)
                    .center()
                    .build();
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_notes,
            db::get_note,
            db::save_note,
            db::move_note_to_folder,
            db::set_sync_mode,
            db::delete_note,
            db::soft_delete_note,
            db::get_trash_notes,
            db::restore_note,
            db::get_folders,
            db::save_folder,
            db::delete_folder,
            db::get_quick_notes,
            open_note_in_main,
            sync::sync_to_markdown,
            sync::sync_from_markdown,
        ])
        .run(tauri::generate_context!())
        .expect("error running tauri application");
}
