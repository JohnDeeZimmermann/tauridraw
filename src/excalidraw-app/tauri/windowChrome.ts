import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  type CursorIcon,
  type Window,
} from "@tauri-apps/api/window";

export type WindowBarMode = "custom" | "native";
export type DesktopPlatform = "linux" | "windows" | "macos";
export type AutosaveIntervalMs = 0 | 1000 | 3000 | 5000 | 10000;
export type WindowBarSettingsSnapshot = {
  mode: WindowBarMode;
  platform: DesktopPlatform;
};

type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

const getCurrentAppWindow = (): Window | null => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
};

export const getWindowBarSettings =
  async (): Promise<WindowBarSettingsSnapshot> => {
    if (!getCurrentAppWindow()) {
      throw new Error("not running in tauri");
    }

    return invoke<WindowBarSettingsSnapshot>("get_window_bar_settings");
  };

export const setWindowBarMode = async (mode: WindowBarMode): Promise<void> => {
  if (!getCurrentAppWindow()) {
    throw new Error("not running in tauri");
  }

  await invoke("set_window_bar_mode", { mode });
};

export const getAutosaveIntervalMs = async (): Promise<AutosaveIntervalMs> => {
  if (!getCurrentAppWindow()) {
    throw new Error("not running in tauri");
  }

  return invoke<AutosaveIntervalMs>("get_autosave_interval_ms");
};

export const setAutosaveIntervalMs = async (
  intervalMs: AutosaveIntervalMs,
): Promise<void> => {
  if (!getCurrentAppWindow()) {
    throw new Error("not running in tauri");
  }

  await invoke("set_autosave_interval_ms", { intervalMs });
};

export const closeWindow = async (): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.close();
  } catch {
    // Let Tauri/native teardown own the close lifecycle. Forcing a destroy()
    // after close() fails can race shutdown and double-free native resources.
  }
};

export const startWindowDrag = async (): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.startDragging();
  } catch {
    // noop
  }
};

export const minimizeWindow = async (): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.minimize();
  } catch {
    // noop
  }
};

export const toggleWindowMaximize = async (): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.toggleMaximize();
  } catch {
    // noop
  }
};

export const startWindowResize = async (
  direction: ResizeDirection,
): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.startResizeDragging(direction);
  } catch {
    // noop
  }
};

export const setWindowCursor = async (cursor: CursorIcon): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.setCursorIcon(cursor);
  } catch {
    // noop
  }
};
