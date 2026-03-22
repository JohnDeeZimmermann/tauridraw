import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  type CursorIcon,
  type Window,
} from "@tauri-apps/api/window";

export type WindowBarMode = "custom" | "native";
export type DesktopPlatform = "linux" | "windows" | "macos";
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

export const closeWindow = async (): Promise<void> => {
  const currentWindow = getCurrentAppWindow();
  if (!currentWindow) {
    return;
  }

  try {
    await currentWindow.close();
  } catch {
    try {
      await currentWindow.destroy();
    } catch {
      // noop: safe fallback outside a native window context
    }
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
