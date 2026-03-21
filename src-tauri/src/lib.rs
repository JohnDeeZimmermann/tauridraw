mod file_commands;
use tauri::Manager;

const FORCE_NATIVE_TITLEBAR_ENV: &str = "TAURIDRAW_FORCE_NATIVE_TITLEBAR";

fn env_truthy(name: &str) -> bool {
    std::env::var(name)
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn should_use_custom_titlebar() -> bool {
    cfg!(target_os = "linux") && !env_truthy(FORCE_NATIVE_TITLEBAR_ENV)
}

#[tauri::command]
fn use_custom_titlebar() -> bool {
    should_use_custom_titlebar()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if should_use_custom_titlebar() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            file_commands::read_excalidraw_file,
            file_commands::write_excalidraw_file,
            use_custom_titlebar
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
