mod backend;
mod keyvault;

use std::path::PathBuf;
use std::sync::Arc;

use backend::{BackendManager, RuntimeConfig};
use tauri::Manager;

/// Sole custom IPC surface for the WebView. Returns runtime status for the local Go API.
/// Does not accept arguments and never exposes shell/filesystem capabilities.
#[tauri::command]
fn get_runtime_config(state: tauri::State<'_, Arc<BackendManager>>) -> RuntimeConfig {
    state.config()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let manager = BackendManager::new();
    let manager_for_setup = Arc::clone(&manager);
    let manager_for_exit = Arc::clone(&manager);

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(manager)
        .invoke_handler(tauri::generate_handler![get_runtime_config])
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

            let app_dir = if manifest_dir.join("tauri.conf.json").is_file() {
                manifest_dir
            } else {
                resource_dir
            };

            let mgr = Arc::clone(&manager_for_setup);
            std::thread::spawn(move || {
                if let Err(_err) = mgr.start(&app_dir) {
                    // Do not print tokens or encryption keys.
                    eprintln!("serverui backend failed to start");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ServerUI desktop")
        .run(move |_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    manager_for_exit.stop();
                }
                _ => {}
            }
        });
}
