import { restoreAppState } from "@excalidraw/excalidraw/data/restore";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

export type DocumentTabId = string;

export type DocumentSceneSnapshot = {
  elements: readonly ExcalidrawElement[];
  appState: ReturnType<typeof restoreAppState>;
  files: BinaryFiles;
};

export type DocumentTabSession = {
  id: DocumentTabId;
  filePath: string | null;
  documentName: string;
  isDirty: boolean;
  snapshot: DocumentSceneSnapshot;
  savedSnapshot: DocumentSceneSnapshot;
};

export type DocumentTabSummary = Pick<
  DocumentTabSession,
  "id" | "filePath" | "documentName" | "isDirty"
>;

export const DEFAULT_DOCUMENT_NAME = "Untitled";

const createDocumentTabId = (): DocumentTabId => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeDocumentName = (name?: string | null) => {
  const normalized = (name || "").trim();
  return normalized || DEFAULT_DOCUMENT_NAME;
};

export const createBlankDocumentSnapshot = (): DocumentSceneSnapshot => ({
  elements: [],
  appState: restoreAppState(null, null),
  files: {},
});

export const cloneDocumentSceneSnapshot = (
  snapshot: DocumentSceneSnapshot,
): DocumentSceneSnapshot => {
  if (typeof structuredClone === "function") {
    return structuredClone(snapshot);
  }

  return {
    elements: snapshot.elements.map((element) => ({ ...element })),
    appState: { ...snapshot.appState },
    files: { ...snapshot.files },
  };
};

export const createDocumentTabSession = (opts?: {
  id?: DocumentTabId;
  filePath?: string | null;
  documentName?: string | null;
  isDirty?: boolean;
  snapshot?: DocumentSceneSnapshot;
  savedSnapshot?: DocumentSceneSnapshot;
}): DocumentTabSession => ({
  id: opts?.id ?? createDocumentTabId(),
  filePath: opts?.filePath ?? null,
  documentName: normalizeDocumentName(opts?.documentName),
  isDirty: opts?.isDirty ?? false,
  snapshot: cloneDocumentSceneSnapshot(
    opts?.snapshot ?? createBlankDocumentSnapshot(),
  ),
  savedSnapshot: cloneDocumentSceneSnapshot(
    opts?.savedSnapshot ?? opts?.snapshot ?? createBlankDocumentSnapshot(),
  ),
});

export const getDocumentTabSummary = (
  session: DocumentTabSession,
): DocumentTabSummary => ({
  id: session.id,
  filePath: session.filePath,
  documentName: session.documentName,
  isDirty: session.isDirty,
});
