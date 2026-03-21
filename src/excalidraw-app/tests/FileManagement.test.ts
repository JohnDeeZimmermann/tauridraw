import { MIME_TYPES } from "@excalidraw/common";
import { vi } from "vitest";

import {
  getDocumentNameFromPath,
  loadNativeExcalidrawFile,
  normalizeExcalidrawPath,
  openNativeExcalidrawFile,
  pickNativeExcalidrawOpenPath,
  pickNativeExcalidrawSavePath,
  saveNativeExcalidrawFile,
  saveNativeExcalidrawFileAs,
} from "../data/nativeFileSystem";

const mocks = vi.hoisted(() => {
  return {
    open: vi.fn(),
    save: vi.fn(),
    invoke: vi.fn(),
    loadFromBlob: vi.fn(),
    serializeAsJSON: vi.fn(),
  };
});

vi.mock(
  "@tauri-apps/plugin-dialog",
  () => {
    return {
      open: mocks.open,
      save: mocks.save,
    };
  },
);

vi.mock(
  "@tauri-apps/api/core",
  () => {
    return {
      invoke: mocks.invoke,
    };
  },
);

vi.mock("@excalidraw/excalidraw/data/blob", () => {
  return {
    loadFromBlob: mocks.loadFromBlob,
  };
});

vi.mock("@excalidraw/excalidraw/data/json", () => {
  return {
    serializeAsJSON: mocks.serializeAsJSON,
  };
});

describe("native file system", () => {
  beforeEach(() => {
    mocks.open.mockReset();
    mocks.save.mockReset();
    mocks.invoke.mockReset();
    mocks.loadFromBlob.mockReset();
    mocks.serializeAsJSON.mockReset();
  });

  it("normalizes path and extracts document name", () => {
    expect(normalizeExcalidrawPath("/tmp/board")).toBe("/tmp/board.excalidraw");
    expect(normalizeExcalidrawPath("/tmp/board.excalidraw")).toBe(
      "/tmp/board.excalidraw",
    );
    expect(getDocumentNameFromPath("/tmp/board.excalidraw")).toBe("board");
    expect(getDocumentNameFromPath("C:\\work\\board.excalidraw")).toBe(
      "board",
    );
  });

  it("opens a scene from the native open dialog", async () => {
    const loadedScene = {
      elements: [],
      appState: null,
      files: {},
    };
    mocks.open.mockResolvedValue("/tmp/opened");
    mocks.invoke.mockResolvedValue("{\"type\":\"excalidraw\"}");
    mocks.loadFromBlob.mockResolvedValue(loadedScene);

    const result = await openNativeExcalidrawFile();

    expect(mocks.invoke).toHaveBeenCalledWith("read_excalidraw_file", {
      path: "/tmp/opened.excalidraw",
    });
    expect(mocks.loadFromBlob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MIME_TYPES.excalidraw,
      }),
      null,
      null,
      null,
    );
    expect(result).toEqual({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: loadedScene,
    });
  });

  it("supports picking paths without reading or writing immediately", async () => {
    mocks.open.mockResolvedValue("/tmp/preflight-open");
    mocks.save.mockResolvedValue("/tmp/preflight-save");

    const openPath = await pickNativeExcalidrawOpenPath();
    const savePath = await pickNativeExcalidrawSavePath("Sketch");

    expect(openPath).toBe("/tmp/preflight-open.excalidraw");
    expect(savePath).toBe("/tmp/preflight-save.excalidraw");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("loads a file from an already-selected path", async () => {
    const loadedScene = {
      elements: [],
      appState: null,
      files: {},
    };
    mocks.invoke.mockResolvedValue("{\"type\":\"excalidraw\"}");
    mocks.loadFromBlob.mockResolvedValue(loadedScene);

    const result = await loadNativeExcalidrawFile("/tmp/already-picked");

    expect(mocks.invoke).toHaveBeenCalledWith("read_excalidraw_file", {
      path: "/tmp/already-picked",
    });
    expect(result).toEqual({
      filePath: "/tmp/already-picked",
      documentName: "already-picked",
      scene: loadedScene,
    });
  });

  it("returns null when open/save dialogs are canceled", async () => {
    mocks.open.mockResolvedValue(null);
    mocks.save.mockResolvedValue(null);

    const openResult = await openNativeExcalidrawFile();
    const saveAsResult = await saveNativeExcalidrawFileAs({
      suggestedName: "Untitled",
      elements: [],
      appState: {} as any,
      files: {},
    });

    expect(openResult).toBeNull();
    expect(saveAsResult).toBeNull();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("saves using save-as and overwrite paths", async () => {
    mocks.serializeAsJSON.mockReturnValue("{\"ok\":true}");
    mocks.save.mockResolvedValue("/tmp/save-target");
    mocks.invoke.mockResolvedValue(undefined);

    const saveAsResult = await saveNativeExcalidrawFileAs({
      suggestedName: "diagram.excalidraw",
      elements: [],
      appState: {} as any,
      files: {},
    });
    const saveResult = await saveNativeExcalidrawFile({
      filePath: "/tmp/existing",
      elements: [],
      appState: {} as any,
      files: {},
    });

    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "diagram",
      }),
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "write_excalidraw_file", {
      path: "/tmp/save-target.excalidraw",
      contents: "{\"ok\":true}",
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "write_excalidraw_file", {
      path: "/tmp/existing.excalidraw",
      contents: "{\"ok\":true}",
    });
    expect(saveAsResult).toEqual({
      filePath: "/tmp/save-target.excalidraw",
      documentName: "save-target",
    });
    expect(saveResult).toEqual({
      filePath: "/tmp/existing.excalidraw",
      documentName: "existing",
    });
  });
});
