import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { MIME_TYPES } from "@excalidraw/common";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

const EXCALIDRAW_EXTENSION = ".excalidraw";
const EXCALIDRAW_FILTER = [{ name: "Excalidraw", extensions: ["excalidraw"] }];
const DEFAULT_DOCUMENT_NAME = "Untitled";

const getPathBaseName = (path: string) => {
  return path.split(/[\\/]/).pop() || path;
};

const stripExcalidrawExtension = (fileName: string) => {
  if (fileName.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)) {
    return fileName.slice(0, -EXCALIDRAW_EXTENSION.length);
  }
  return fileName;
};

export const normalizeExcalidrawPath = (path: string) => {
  if (path.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)) {
    return path;
  }
  return `${path}${EXCALIDRAW_EXTENSION}`;
};

export const getDocumentNameFromPath = (path: string) => {
  const fileName = getPathBaseName(path);
  const withoutExtension = stripExcalidrawExtension(fileName).trim();
  return withoutExtension || DEFAULT_DOCUMENT_NAME;
};

const getSuggestedFileName = (name?: string | null) => {
  const normalized = stripExcalidrawExtension((name || "").trim());
  return normalized || DEFAULT_DOCUMENT_NAME;
};

export const openNativeExcalidrawFile = async () => {
  const selectedPath = await pickNativeExcalidrawOpenPath();

  if (!selectedPath) {
    return null;
  }

  return loadNativeExcalidrawFile(selectedPath);
};

export const pickNativeExcalidrawOpenPath = async () => {
  const selectedPath = await open({
    multiple: false,
    directory: false,
    filters: EXCALIDRAW_FILTER,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return normalizeExcalidrawPath(selectedPath);
};

export const loadNativeExcalidrawFile = async (filePath: string) => {
  const contents = await invoke<string>("read_excalidraw_file", {
    path: filePath,
  });
  const scene = await loadFromBlob(
    new Blob([contents], { type: MIME_TYPES.excalidraw }),
    null,
    null,
    null,
  );

  return {
    filePath,
    documentName: getDocumentNameFromPath(filePath),
    scene,
  };
};

export const saveNativeExcalidrawFile = async (opts: {
  filePath: string;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}) => {
  const filePath = normalizeExcalidrawPath(opts.filePath);
  const contents = serializeAsJSON(
    opts.elements,
    opts.appState,
    opts.files,
    "local",
  );
  await invoke("write_excalidraw_file", { path: filePath, contents });
  return {
    filePath,
    documentName: getDocumentNameFromPath(filePath),
  };
};

export const saveNativeExcalidrawFileAs = async (opts: {
  suggestedName?: string | null;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
}) => {
  const selectedPath = await pickNativeExcalidrawSavePath(opts.suggestedName);

  if (!selectedPath) {
    return null;
  }

  return saveNativeExcalidrawFile({
    filePath: selectedPath,
    elements: opts.elements,
    appState: opts.appState,
    files: opts.files,
  });
};

export const pickNativeExcalidrawSavePath = async (
  suggestedName?: string | null,
) => {
  const selectedPath = await save({
    filters: EXCALIDRAW_FILTER,
    defaultPath: getSuggestedFileName(suggestedName),
  });

  if (!selectedPath) {
    return null;
  }

  return normalizeExcalidrawPath(selectedPath);
};
