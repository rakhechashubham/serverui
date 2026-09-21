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

            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| {
                    dirs_fallback_app_data()
                });

            let mgr = Arc::clone(&manager_for_setup);
            std::thread::spawn(move || {
                if let Err(_err) = mgr.start(&app_dir, &data_dir) {
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

fn dirs_fallback_app_data() -> PathBuf {
    // Last-resort path if Tauri PathResolver fails. Prefer identifier-shaped
    // Application Support / APPDATA / XDG locations without requiring extra crates.
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/com.serverui.desktop")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Roaming"))
            .join("com.serverui.desktop")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
            .join("com.serverui.desktop")
    }
}
