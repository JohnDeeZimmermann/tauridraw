use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};

const SETTINGS_FILE_NAME: &str = "settings.json";
pub const AUTOSAVE_INTERVAL_DISABLED_MS: u64 = 0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowBarMode {
    Custom,
    Native,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DesktopPlatform {
    Linux,
    Windows,
    Macos,
}

impl DesktopPlatform {
    pub fn current() -> Self {
        if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::Macos
        } else {
            Self::Linux
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBarSettingsSnapshot {
    pub mode: WindowBarMode,
    pub platform: DesktopPlatform,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    window_bar_mode: Option<WindowBarMode>,
    autosave_interval_ms: Option<u64>,
}

pub fn load_window_bar_mode<R: Runtime>(app: &AppHandle<R>) -> io::Result<WindowBarMode> {
    let path = settings_path(app)?;
    load_window_bar_mode_from_path(&path)
}

pub fn load_autosave_interval_ms<R: Runtime>(app: &AppHandle<R>) -> io::Result<u64> {
    let path = settings_path(app)?;
    load_autosave_interval_ms_from_path(&path)
}

pub fn save_window_bar_mode<R: Runtime>(app: &AppHandle<R>, mode: WindowBarMode) -> io::Result<()> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    save_window_bar_mode_to_path(&path, mode)
}

pub fn save_autosave_interval_ms<R: Runtime>(
    app: &AppHandle<R>,
    interval_ms: u64,
) -> io::Result<()> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    save_autosave_interval_ms_to_path(&path, interval_ms)
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    let config_dir = app.path().app_config_dir().map_err(io::Error::other)?;
    Ok(config_dir.join(SETTINGS_FILE_NAME))
}

fn load_window_bar_mode_from_path(path: &Path) -> io::Result<WindowBarMode> {
    let settings = load_settings_from_path(path)?;
    Ok(settings.window_bar_mode.unwrap_or(WindowBarMode::Custom))
}

fn save_window_bar_mode_to_path(path: &Path, mode: WindowBarMode) -> io::Result<()> {
    let mut settings = load_settings_from_path(path)?;
    settings.window_bar_mode = Some(mode);
    save_settings_to_path(path, &settings)
}

fn load_autosave_interval_ms_from_path(path: &Path) -> io::Result<u64> {
    let settings = load_settings_from_path(path)?;
    Ok(settings
        .autosave_interval_ms
        .filter(|interval_ms| is_valid_autosave_interval_ms(*interval_ms))
        .unwrap_or(AUTOSAVE_INTERVAL_DISABLED_MS))
}

fn save_autosave_interval_ms_to_path(path: &Path, interval_ms: u64) -> io::Result<()> {
    let mut settings = load_settings_from_path(path)?;
    settings.autosave_interval_ms = Some(interval_ms);
    save_settings_to_path(path, &settings)
}

fn load_settings_from_path(path: &Path) -> io::Result<AppSettings> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(AppSettings::default());
        }
        Err(error) => return Ok(or_default(error)),
    };

    Ok(serde_json::from_str::<AppSettings>(&content).unwrap_or_default())
}

fn save_settings_to_path(path: &Path, settings: &AppSettings) -> io::Result<()> {
    let content = serde_json::to_string_pretty(settings).map_err(io::Error::other)?;
    fs::write(path, content)
}

fn or_default(_error: io::Error) -> AppSettings {
    AppSettings::default()
}

pub fn is_valid_autosave_interval_ms(interval_ms: u64) -> bool {
    matches!(interval_ms, 0 | 1000 | 3000 | 5000 | 10000)
}

#[cfg(test)]
mod tests {
    use super::{load_window_bar_mode_from_path, save_window_bar_mode_to_path, WindowBarMode};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_settings_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        std::env::temp_dir()
            .join("tauridraw-settings-tests")
            .join(format!("{test_name}-{nanos}.json"))
    }

    #[test]
    fn missing_settings_defaults_to_custom() {
        let path = temp_settings_path("missing");
        let loaded = load_window_bar_mode_from_path(&path).expect("load should succeed");
        assert_eq!(loaded, WindowBarMode::Custom);
    }

    #[test]
    fn invalid_settings_defaults_to_custom() {
        let path = temp_settings_path("invalid");
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create parent");
        }
        fs::write(&path, "{not-json").expect("failed to write invalid settings");

        let loaded = load_window_bar_mode_from_path(&path).expect("load should succeed");
        assert_eq!(loaded, WindowBarMode::Custom);
    }

    #[test]
    fn round_trips_native_and_custom_modes() {
        let native_path = temp_settings_path("native");
        if let Some(parent) = native_path.parent() {
            fs::create_dir_all(parent).expect("failed to create parent");
        }
        save_window_bar_mode_to_path(&native_path, WindowBarMode::Native)
            .expect("failed to save native");
        let loaded_native =
            load_window_bar_mode_from_path(&native_path).expect("failed to load native");
        assert_eq!(loaded_native, WindowBarMode::Native);

        let custom_path = temp_settings_path("custom");
        if let Some(parent) = custom_path.parent() {
            fs::create_dir_all(parent).expect("failed to create parent");
        }
        save_window_bar_mode_to_path(&custom_path, WindowBarMode::Custom)
            .expect("failed to save custom");
        let loaded_custom =
            load_window_bar_mode_from_path(&custom_path).expect("failed to load custom");
        assert_eq!(loaded_custom, WindowBarMode::Custom);
    }
}
