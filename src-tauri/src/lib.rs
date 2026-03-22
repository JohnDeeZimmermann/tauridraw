mod file_commands;
mod settings;

use tauri::Manager;

use settings::{DesktopPlatform, WindowBarMode, WindowBarSettingsSnapshot};

#[tauri::command]
fn get_window_bar_settings(app: tauri::AppHandle) -> WindowBarSettingsSnapshot {
    let mode = settings::load_window_bar_mode(&app).unwrap_or(WindowBarMode::Custom);
    WindowBarSettingsSnapshot {
        mode,
        platform: DesktopPlatform::current(),
    }
}

#[tauri::command]
fn set_window_bar_mode(app: tauri::AppHandle, mode: WindowBarMode) -> Result<(), String> {
    settings::save_window_bar_mode(&app, mode).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mode = settings::load_window_bar_mode(app.handle()).unwrap_or(WindowBarMode::Custom);
            if mode == WindowBarMode::Custom {
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
            get_window_bar_settings,
            set_window_bar_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
