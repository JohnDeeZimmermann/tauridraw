import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  type CursorIcon,
  type Window,
} from "@tauri-apps/api/window";

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

export const getUseCustomTitlebar = async (): Promise<boolean> => {
  if (!getCurrentAppWindow()) {
    return false;
  }

  try {
    return await invoke<boolean>("use_custom_titlebar");
  } catch {
    return false;
  }
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
