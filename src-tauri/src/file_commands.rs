use std::fs;
use std::path::Path;

fn validate_excalidraw_path(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());

    if extension.as_deref() != Some("excalidraw") {
        return Err("Only .excalidraw files are supported.".to_owned());
    }

    Ok(())
}

#[tauri::command]
pub fn read_excalidraw_file(path: String) -> Result<String, String> {
    validate_excalidraw_path(&path)?;
    fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read file '{}': {}", path, error))
}

#[tauri::command]
pub fn write_excalidraw_file(path: String, contents: String) -> Result<(), String> {
    validate_excalidraw_path(&path)?;
    fs::write(&path, contents)
        .map_err(|error| format!("Failed to write file '{}': {}", path, error))
}
