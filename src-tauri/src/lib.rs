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

#[tauri::command]
fn get_autosave_interval_ms(app: tauri::AppHandle) -> u64 {
    settings::load_autosave_interval_ms(&app).unwrap_or(settings::AUTOSAVE_INTERVAL_DISABLED_MS)
}

#[tauri::command]
fn set_autosave_interval_ms(app: tauri::AppHandle, interval_ms: u64) -> Result<(), String> {
    if !settings::is_valid_autosave_interval_ms(interval_ms) {
        return Err("Invalid autosave interval".to_owned());
    }

    settings::save_autosave_interval_ms(&app, interval_ms).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mode =
                settings::load_window_bar_mode(app.handle()).unwrap_or(WindowBarMode::Custom);
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
            set_window_bar_mode,
            get_autosave_interval_ms,
            set_autosave_interval_ms
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
