import { Excalidraw, CaptureUpdateAction } from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  getVersion,
  getFrame,
  resolvablePromise,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { useCallbackRefState } from "@excalidraw/excalidraw/hooks/useCallbackRefState";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  GithubIcon,
  XBrandIcon,
  DiscordIcon,
  youtubeIcon,
  file,
  LoadIcon,
  save,
  saveAs,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import { Provider, appJotaiStore } from "./app-jotai";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { DirtyTabDialog } from "./components/DirtyTabDialog";
import { DocumentTabs } from "./components/DocumentTabs";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
} from "./data/LocalData";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import "./index.scss";
import { AppSidebar } from "./components/AppSidebar";
import { TauriResizeHandles } from "./components/TauriResizeHandles";
import { TauriTitleBar } from "./components/TauriTitleBar";
import {
  loadNativeExcalidrawFile,
  pickNativeExcalidrawOpenPath,
  pickNativeExcalidrawSavePath,
  saveNativeExcalidrawFile,
} from "./data/nativeFileSystem";
import {
  cloneDocumentSceneSnapshot,
  createBlankDocumentSnapshot,
  createDocumentTabSession,
  DEFAULT_DOCUMENT_NAME,
  getDocumentTabSummary,
  normalizeDocumentName,
} from "./data/documentTabs";
import { getLoadedSceneAppState } from "./sceneAppState";
import { getUseCustomTitlebar } from "./tauri/windowChrome";
import { getWindowChromeColors } from "./windowChromeColors";

import type {
  DocumentSceneSnapshot,
  DocumentTabId,
  DocumentTabSession,
  DocumentTabSummary,
} from "./data/documentTabs";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const markSavedImageElements = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
) => {
  return elements.map((element) => {
    if (
      isInitializedImageElement(element) &&
      element.status === "pending" &&
      files[element.fileId]
    ) {
      return newElementWith(element, { status: "saved" });
    }
    return element;
  });
};

const initializeScene = async (): Promise<
  { scene: ExcalidrawInitialDataState | null } & { isExternalScene: boolean }
> => {
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: [],
    appState: restoreAppState(null, null),
  };

  if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene: true };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene: true,
      };
    }
  }

  if (scene) {
    return { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

const createSnapshotFromScene = (
  scene: ExcalidrawInitialDataState | null | undefined,
): DocumentSceneSnapshot => {
  const files = scene?.files ?? {};

  return cloneDocumentSceneSnapshot({
    elements: markSavedImageElements(
      restoreElements(scene?.elements ?? [], null, {
        repairBindings: true,
      }),
      files,
    ),
    appState: restoreAppState(scene?.appState ?? null, null),
    files,
  });
};

const getNextTabIdAfterClose = (
  tabOrder: DocumentTabId[],
  documentId: DocumentTabId,
) => {
  const closedIndex = tabOrder.indexOf(documentId);
  if (closedIndex <= 0) {
    return tabOrder[1] ?? null;
  }
  return tabOrder[closedIndex - 1] ?? null;
};

const isSnapshotDirty = (
  session: DocumentTabSession,
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => {
  const currentSerialized = serializeAsJSON(
    elements,
    restoreAppState(appState, null),
    files,
    "local",
  );
  const savedSerialized = serializeAsJSON(
    session.snapshot.elements,
    session.snapshot.appState,
    session.snapshot.files,
    "local",
  );

  return currentSerialized !== savedSerialized;
};

const isPlaceholderDocumentSession = (session: DocumentTabSession) => {
  return (
    session.filePath === null &&
    !session.isDirty &&
    session.snapshot.elements.length === 0 &&
    Object.keys(session.snapshot.files).length === 0
  );
};

const ExcalidrawWrapper = () => {
  const [errorMessage, setErrorMessage] = useState("");
  const [useCustomTitlebar, setUseCustomTitlebar] = useState(false);

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  useEffect(() => {
    let active = true;
    void getUseCustomTitlebar().then((enabled) => {
      if (active) {
        setUseCustomTitlebar(enabled);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();
  const getSceneAppStateForCurrentTheme = useCallback(
    (sceneAppState: RestoredDataState["appState"], name?: AppState["name"]) =>
      getLoadedSceneAppState({
        sceneAppState,
        editorTheme,
        name,
      }),
    [editorTheme],
  );

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);
  const initialDocumentRef = useRef<DocumentTabSession>(
    createDocumentTabSession({
      snapshot: createBlankDocumentSnapshot(),
    }),
  );
  const documentsRef = useRef<Map<DocumentTabId, DocumentTabSession>>(
    new Map([[initialDocumentRef.current.id, initialDocumentRef.current]]),
  );
  const [tabOrder, setTabOrder] = useState<DocumentTabId[]>([
    initialDocumentRef.current.id,
  ]);
  const [activeDocumentId, setActiveDocumentId] =
    useState<DocumentTabId | null>(initialDocumentRef.current.id);
  const [activeViewBackgroundColor, setActiveViewBackgroundColor] = useState(
    initialDocumentRef.current.snapshot.appState.viewBackgroundColor,
  );
  const [tabSummaries, setTabSummaries] = useState<
    Record<DocumentTabId, DocumentTabSummary>
  >({
    [initialDocumentRef.current.id]: getDocumentTabSummary(
      initialDocumentRef.current,
    ),
  });
  const [dirtyTabDialog, setDirtyTabDialog] = useState<{
    documentId: DocumentTabId;
    isSaving: boolean;
  } | null>(null);
  const programmaticChangeDepthRef = useRef(0);

  const runAsProgrammaticSceneMutation = useCallback(
    async (callback: () => void | Promise<void>) => {
      programmaticChangeDepthRef.current += 1;
      try {
        await callback();
      } finally {
        queueMicrotask(() => {
          programmaticChangeDepthRef.current = Math.max(
            0,
            programmaticChangeDepthRef.current - 1,
          );
        });
      }
    },
    [],
  );

  const syncTabSummary = useCallback((session: DocumentTabSession) => {
    const nextSummary = getDocumentTabSummary(session);

    setTabSummaries((previousSummaries) => {
      const currentSummary = previousSummaries[session.id];

      if (
        currentSummary?.filePath === nextSummary.filePath &&
        currentSummary?.documentName === nextSummary.documentName &&
        currentSummary?.isDirty === nextSummary.isDirty
      ) {
        return previousSummaries;
      }

      return {
        ...previousSummaries,
        [session.id]: nextSummary,
      };
    });
  }, []);

  const removeTabSummary = useCallback((documentId: DocumentTabId) => {
    setTabSummaries((previousSummaries) => {
      if (!(documentId in previousSummaries)) {
        return previousSummaries;
      }

      const nextSummaries = { ...previousSummaries };
      delete nextSummaries[documentId];
      return nextSummaries;
    });
  }, []);

  const upsertDocumentSession = useCallback(
    (session: DocumentTabSession) => {
      documentsRef.current.set(session.id, session);
      syncTabSummary(session);
    },
    [syncTabSummary],
  );

  const commitActiveTabSnapshot = useCallback(() => {
    if (!excalidrawAPI || !activeDocumentId) {
      return null;
    }

    const session = documentsRef.current.get(activeDocumentId);
    if (!session) {
      return null;
    }

    const snapshot = cloneDocumentSceneSnapshot({
      elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
      appState: restoreAppState(excalidrawAPI.getAppState(), null),
      files: excalidrawAPI.getFiles(),
    });

    session.snapshot = snapshot;
    session.documentName = normalizeDocumentName(
      excalidrawAPI.getName() || snapshot.appState.name || session.documentName,
    );

    documentsRef.current.set(session.id, session);
    syncTabSummary(session);
    return session;
  }, [activeDocumentId, excalidrawAPI, syncTabSummary]);

  const loadTabIntoEditor = useCallback(
    async (documentId: DocumentTabId) => {
      if (!excalidrawAPI) {
        return;
      }

      const session = documentsRef.current.get(documentId);
      if (!session) {
        return;
      }

      const snapshot = cloneDocumentSceneSnapshot(session.snapshot);
      setActiveViewBackgroundColor(snapshot.appState.viewBackgroundColor);

      await runAsProgrammaticSceneMutation(async () => {
        excalidrawAPI.resetScene({ resetLoadingState: true });
        const filesToAdd = Object.values(snapshot.files);
        if (filesToAdd.length) {
          excalidrawAPI.addFiles(filesToAdd);
        }
        excalidrawAPI.updateScene({
          elements: snapshot.elements,
          appState: getSceneAppStateForCurrentTheme(
            snapshot.appState,
            session.documentName,
          ),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        // Tabs share one editor instance in v1, so switching tabs resets
        // undo/redo instead of reaching into Excalidraw private history stacks.
        excalidrawAPI.history.clear();
      });

      setActiveDocumentId(documentId);
      syncTabSummary(session);
    },
    [
      excalidrawAPI,
      getSceneAppStateForCurrentTheme,
      runAsProgrammaticSceneMutation,
      syncTabSummary,
    ],
  );

  const createAndActivateBlankTab = useCallback(async () => {
    const session = createDocumentTabSession();
    upsertDocumentSession(session);
    setTabOrder((previousTabOrder) => [...previousTabOrder, session.id]);
    await loadTabIntoEditor(session.id);
    return session.id;
  }, [loadTabIntoEditor, upsertDocumentSession]);

  const findOpenTabByPath = useCallback(
    (filePath: string, excludeId?: string) => {
      for (const [documentId, session] of documentsRef.current.entries()) {
        if (documentId === excludeId) {
          continue;
        }
        if (session.filePath === filePath) {
          return session;
        }
      }
      return null;
    },
    [],
  );

  const shouldReuseActivePlaceholderTabForOpen = useCallback(() => {
    if (!activeDocumentId || tabOrder.length !== 1) {
      return false;
    }

    const session = documentsRef.current.get(activeDocumentId);
    if (!session || !isPlaceholderDocumentSession(session)) {
      return false;
    }

    return true;
  }, [activeDocumentId, tabOrder]);

  const saveDocumentById = useCallback(
    async (
      documentId: DocumentTabId,
      opts?: {
        forceSaveAs?: boolean;
      },
    ) => {
      const session = documentsRef.current.get(documentId);
      if (!session) {
        return false;
      }

      if (documentId === activeDocumentId) {
        commitActiveTabSnapshot();
      }

      const latestSession = documentsRef.current.get(documentId);
      if (!latestSession) {
        return false;
      }

      try {
        let nextFilePath = latestSession.filePath;
        if (opts?.forceSaveAs || !nextFilePath) {
          nextFilePath = await pickNativeExcalidrawSavePath(
            latestSession.documentName,
          );

          if (!nextFilePath) {
            return false;
          }

          const duplicateSession = findOpenTabByPath(nextFilePath, documentId);
          if (duplicateSession) {
            setErrorMessage("File is already open in another tab");
            return false;
          }
        }

        if (!nextFilePath) {
          return false;
        }

        const result = await saveNativeExcalidrawFile({
          filePath: nextFilePath,
          elements: latestSession.snapshot.elements,
          appState: latestSession.snapshot.appState,
          files: latestSession.snapshot.files,
        });

        latestSession.filePath = result.filePath;
        latestSession.documentName = result.documentName;
        latestSession.isDirty = false;
        latestSession.snapshot = cloneDocumentSceneSnapshot({
          ...latestSession.snapshot,
          appState: restoreAppState(
            {
              ...latestSession.snapshot.appState,
              name: result.documentName,
            },
            null,
          ),
        });

        documentsRef.current.set(documentId, latestSession);
        syncTabSummary(latestSession);

        if (documentId === activeDocumentId && excalidrawAPI) {
          await runAsProgrammaticSceneMutation(async () => {
            excalidrawAPI.updateScene({
              appState: { name: result.documentName },
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          });
        }

        return true;
      } catch (error: any) {
        setErrorMessage(error?.message || "Failed to save file");
        return false;
      }
    },
    [
      activeDocumentId,
      commitActiveTabSnapshot,
      excalidrawAPI,
      findOpenTabByPath,
      runAsProgrammaticSceneMutation,
      syncTabSummary,
    ],
  );

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    initializeScene().then((data) => {
      initialStatePromiseRef.current.promise.resolve(data.scene);
      const initialSession = documentsRef.current.get(
        initialDocumentRef.current.id,
      );
      if (!initialSession) {
        return;
      }

      if (!isPlaceholderDocumentSession(initialSession)) {
        return;
      }

      initialSession.filePath = null;
      initialSession.documentName = normalizeDocumentName(
        data.scene?.appState?.name,
      );
      initialSession.isDirty = false;
      initialSession.snapshot = createSnapshotFromScene(data.scene);
      documentsRef.current.set(initialSession.id, initialSession);
      syncTabSummary(initialSession);
      if (activeDocumentId === initialSession.id) {
        setActiveViewBackgroundColor(
          initialSession.snapshot.appState.viewBackgroundColor,
        );
      }
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene().then(async (data) => {
          const targetId = activeDocumentId ?? initialDocumentRef.current.id;
          const session =
            documentsRef.current.get(targetId) ??
            createDocumentTabSession({ id: targetId });

          session.filePath = null;
          session.documentName = normalizeDocumentName(
            data.scene?.appState?.name,
          );
          session.isDirty = false;
          session.snapshot = createSnapshotFromScene(data.scene);
          upsertDocumentSession(session);

          if (!tabOrder.includes(targetId)) {
            setTabOrder((previousTabOrder) => [...previousTabOrder, targetId]);
          }

          await loadTabIntoEditor(targetId);
        });
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
    };
  }, [
    activeDocumentId,
    excalidrawAPI,
    loadTabIntoEditor,
    syncTabSummary,
    tabOrder,
    upsertDocumentSession,
  ]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    _files: BinaryFiles,
  ) => {
    setActiveViewBackgroundColor(appState.viewBackgroundColor);
    const isProgrammaticChange = programmaticChangeDepthRef.current > 0;

    if (activeDocumentId && !isProgrammaticChange) {
      const session = documentsRef.current.get(activeDocumentId);
      if (session) {
        session.documentName = normalizeDocumentName(appState.name);
        session.isDirty = isSnapshotDirty(session, elements, appState, _files);
        documentsRef.current.set(session.id, session);
        syncTabSummary(session);
      }
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const closeDocumentById = useCallback(
    async (documentId: DocumentTabId) => {
      const nextTabId = getNextTabIdAfterClose(tabOrder, documentId);
      const isActiveTab = documentId === activeDocumentId;

      documentsRef.current.delete(documentId);
      removeTabSummary(documentId);
      setTabOrder((previousTabOrder) =>
        previousTabOrder.filter((tabId) => tabId !== documentId),
      );

      if (!isActiveTab) {
        return;
      }

      if (nextTabId) {
        await loadTabIntoEditor(nextTabId);
        return;
      }

      await createAndActivateBlankTab();
    },
    [
      activeDocumentId,
      createAndActivateBlankTab,
      loadTabIntoEditor,
      removeTabSummary,
      tabOrder,
    ],
  );

  const requestCloseDocument = useCallback(
    async (documentId: DocumentTabId) => {
      if (documentId === activeDocumentId) {
        commitActiveTabSnapshot();
      }

      const session = documentsRef.current.get(documentId);
      if (!session) {
        return;
      }

      if (session.isDirty) {
        setDirtyTabDialog({
          documentId,
          isSaving: false,
        });
        return;
      }

      await closeDocumentById(documentId);
    },
    [activeDocumentId, closeDocumentById, commitActiveTabSnapshot],
  );

  const handleSelectDocumentTab = useCallback(
    async (documentId: DocumentTabId) => {
      if (!documentId || documentId === activeDocumentId) {
        return;
      }

      commitActiveTabSnapshot();
      await loadTabIntoEditor(documentId);
    },
    [activeDocumentId, commitActiveTabSnapshot, loadTabIntoEditor],
  );

  const handleNewDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    commitActiveTabSnapshot();
    await createAndActivateBlankTab();
  }, [commitActiveTabSnapshot, createAndActivateBlankTab, excalidrawAPI]);

  const handleOpenDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    try {
      const filePath = await pickNativeExcalidrawOpenPath();
      if (!filePath) {
        return;
      }

      const existingSession = findOpenTabByPath(filePath);
      if (existingSession) {
        if (existingSession.id !== activeDocumentId) {
          commitActiveTabSnapshot();
          await loadTabIntoEditor(existingSession.id);
        }
        return;
      }

      commitActiveTabSnapshot();

      const result = await loadNativeExcalidrawFile(filePath);
      const snapshot = createSnapshotFromScene(result.scene);

      if (shouldReuseActivePlaceholderTabForOpen() && activeDocumentId) {
        const session = createDocumentTabSession({
          id: activeDocumentId,
          filePath: result.filePath,
          documentName: result.documentName,
          snapshot,
        });

        upsertDocumentSession(session);
        await loadTabIntoEditor(session.id);
        return;
      }

      const session = createDocumentTabSession({
        filePath: result.filePath,
        documentName: result.documentName,
        snapshot,
      });

      upsertDocumentSession(session);
      setTabOrder((previousTabOrder) => [...previousTabOrder, session.id]);
      await loadTabIntoEditor(session.id);
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to open file");
    }
  }, [
    activeDocumentId,
    commitActiveTabSnapshot,
    excalidrawAPI,
    findOpenTabByPath,
    loadTabIntoEditor,
    shouldReuseActivePlaceholderTabForOpen,
    upsertDocumentSession,
  ]);

  const handleSaveAsDocument = useCallback(async () => {
    if (!activeDocumentId) {
      return false;
    }
    return saveDocumentById(activeDocumentId, { forceSaveAs: true });
  }, [activeDocumentId, saveDocumentById]);

  const handleSaveDocument = useCallback(async () => {
    if (!activeDocumentId) {
      return;
    }
    await saveDocumentById(activeDocumentId);
  }, [activeDocumentId, saveDocumentById]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        void handleNewDocument();
        return;
      }
      if (key === "o" && !event.shiftKey) {
        event.preventDefault();
        void handleOpenDocument();
        return;
      }
      if (key === "s" && event.shiftKey) {
        event.preventDefault();
        void handleSaveAsDocument();
        return;
      }
      if (key === "s") {
        event.preventDefault();
        void handleSaveDocument();
      }
    };

    window.addEventListener(EVENT.KEYDOWN, handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener(EVENT.KEYDOWN, handleKeyDown, {
        capture: true,
      });
    };
  }, [
    handleNewDocument,
    handleOpenDocument,
    handleSaveAsDocument,
    handleSaveDocument,
  ]);

  const renderedTabs = tabOrder
    .map((tabId) => tabSummaries[tabId])
    .filter(
      (tabSummary): tabSummary is DocumentTabSummary =>
        tabSummary !== undefined,
    );
  const activeTabSummary = activeDocumentId
    ? tabSummaries[activeDocumentId] ?? null
    : null;
  const chromeColors = getWindowChromeColors({
    theme: editorTheme,
    viewBackgroundColor: activeViewBackgroundColor,
  });
  const dirtyDialogState = dirtyTabDialog;
  const dirtyDialogDocument = dirtyDialogState
    ? documentsRef.current.get(dirtyDialogState.documentId) ?? null
    : null;

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div className="excalidraw-app">
      {useCustomTitlebar && (
        <TauriTitleBar
          title="tauridraw"
          subtitle={activeTabSummary?.documentName || DEFAULT_DOCUMENT_NAME}
          chromeColors={chromeColors}
        />
      )}
      {useCustomTitlebar && <TauriResizeHandles />}
      <DocumentTabs
        tabs={renderedTabs}
        activeTabId={activeDocumentId}
        chromeColors={chromeColors}
        onSelectTab={(tabId) => {
          void handleSelectDocumentTab(tabId);
        }}
        onCloseTab={(tabId) => {
          void requestCloseDocument(tabId);
        }}
      />
      <div className="excalidraw-app__content">
        <Excalidraw
          excalidrawAPI={excalidrawRefCallback}
          onChange={onChange}
          initialData={initialStatePromiseRef.current.promise}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
              loadScene: false,
              saveToActiveFile: false,
              export: {
                saveFileToDisk: false,
              },
            },
          }}
          langCode={langCode}
          renderCustomStats={renderCustomStats}
          detectScroll={false}
          handleKeyboardGlobally={true}
          autoFocus={true}
          theme={editorTheme}
          onLinkOpen={(element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.scrollToContent(element.link, { animate: true });
            }
          }}
        >
          <AppMainMenu
            theme={appTheme}
            setTheme={(theme) => setAppTheme(theme)}
            refresh={() => forceRefresh((prev) => !prev)}
            onNewDocument={() => void handleNewDocument()}
            onOpenDocument={() => void handleOpenDocument()}
            onSaveDocument={() => void handleSaveDocument()}
            onSaveAsDocument={() => void handleSaveAsDocument()}
          />
          <AppWelcomeScreen onOpenDocument={() => void handleOpenDocument()} />
          <OverwriteConfirmDialog>
            <OverwriteConfirmDialog.Actions.ExportToImage />
            <OverwriteConfirmDialog.Action
              title={t("overwriteConfirm.action.saveToDisk.title")}
              actionLabel={t("overwriteConfirm.action.saveToDisk.button")}
              onClick={() => {
                void handleSaveAsDocument();
              }}
            >
              {t("overwriteConfirm.action.saveToDisk.description")}
            </OverwriteConfirmDialog.Action>
          </OverwriteConfirmDialog>
          <AppFooter onChange={() => excalidrawAPI?.refresh()} />
          <AppSidebar />

          {dirtyDialogDocument && dirtyDialogState && (
            <DirtyTabDialog
              documentName={dirtyDialogDocument.documentName}
              isSaving={dirtyDialogState.isSaving}
              onCancel={() => {
                setDirtyTabDialog(null);
              }}
              onDiscard={() => {
                setDirtyTabDialog(null);
                void closeDocumentById(dirtyDialogState.documentId);
              }}
              onSave={() => {
                setDirtyTabDialog((previousDialog) =>
                  previousDialog
                    ? {
                        ...previousDialog,
                        isSaving: true,
                      }
                    : previousDialog,
                );
                void saveDocumentById(dirtyDialogState.documentId).then(
                  (saved) => {
                    if (!saved) {
                      setDirtyTabDialog((previousDialog) =>
                        previousDialog
                          ? {
                              ...previousDialog,
                              isSaving: false,
                            }
                          : previousDialog,
                      );
                      return;
                    }

                    setDirtyTabDialog(null);
                    void closeDocumentById(dirtyDialogState.documentId);
                  },
                );
              }}
            />
          )}

          {errorMessage && (
            <ErrorDialog onClose={() => setErrorMessage("")}>
              {errorMessage}
            </ErrorDialog>
          )}

          <CommandPalette
            customCommandPaletteItems={[
              {
                label: "New file",
                category: DEFAULT_CATEGORIES.app,
                predicate: true,
                icon: file,
                keywords: ["new", "file", "document", "blank"],
                perform: () => {
                  void handleNewDocument();
                },
              },
              {
                label: "Open file",
                category: DEFAULT_CATEGORIES.app,
                predicate: true,
                icon: LoadIcon,
                keywords: ["open", "file", "document"],
                perform: () => {
                  void handleOpenDocument();
                },
              },
              {
                label: "Save file",
                category: DEFAULT_CATEGORIES.export,
                predicate: true,
                icon: save,
                keywords: ["save", "write", "file"],
                perform: () => {
                  void handleSaveDocument();
                },
              },
              {
                label: "Save file as",
                category: DEFAULT_CATEGORIES.export,
                predicate: true,
                icon: saveAs,
                keywords: ["save", "as", "file", "rename"],
                perform: () => {
                  void handleSaveAsDocument();
                },
              },
              {
                label: "GitHub",
                icon: GithubIcon,
                category: DEFAULT_CATEGORIES.links,
                predicate: true,
                keywords: [
                  "issues",
                  "bugs",
                  "requests",
                  "report",
                  "features",
                  "social",
                  "community",
                ],
                perform: () => {
                  window.open(
                    "https://github.com/excalidraw/excalidraw",
                    "_blank",
                    "noopener noreferrer",
                  );
                },
              },
              {
                label: t("labels.followUs"),
                icon: XBrandIcon,
                category: DEFAULT_CATEGORIES.links,
                predicate: true,
                keywords: ["twitter", "contact", "social", "community"],
                perform: () => {
                  window.open(
                    "https://x.com/excalidraw",
                    "_blank",
                    "noopener noreferrer",
                  );
                },
              },
              {
                label: t("labels.discordChat"),
                category: DEFAULT_CATEGORIES.links,
                predicate: true,
                icon: DiscordIcon,
                keywords: [
                  "chat",
                  "talk",
                  "contact",
                  "bugs",
                  "requests",
                  "report",
                  "feedback",
                  "suggestions",
                  "social",
                  "community",
                ],
                perform: () => {
                  window.open(
                    "https://discord.gg/UexuTaE",
                    "_blank",
                    "noopener noreferrer",
                  );
                },
              },
              {
                label: "YouTube",
                icon: youtubeIcon,
                category: DEFAULT_CATEGORIES.links,
                predicate: true,
                keywords: [
                  "features",
                  "tutorials",
                  "howto",
                  "help",
                  "community",
                ],
                perform: () => {
                  window.open(
                    "https://youtube.com/@excalidraw",
                    "_blank",
                    "noopener noreferrer",
                  );
                },
              },
              {
                ...CommandPalette.defaultItems.toggleTheme,
                perform: () => {
                  setAppTheme(
                    editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                  );
                },
              },
              {
                label: t("labels.installPWA"),
                category: DEFAULT_CATEGORIES.app,
                predicate: () => !!pwaEvent,
                perform: () => {
                  if (pwaEvent) {
                    pwaEvent.prompt();
                    pwaEvent.userChoice.then(() => {
                      // event cannot be reused, but we'll hopefully
                      // grab new one as the event should be fired again
                      pwaEvent = null;
                    });
                  }
                },
              },
            ]}
          />
          {isVisualDebuggerEnabled() && excalidrawAPI && (
            <DebugCanvas
              appState={excalidrawAPI.getAppState()}
              scale={window.devicePixelRatio}
              ref={debugCanvasRef}
            />
          )}
        </Excalidraw>
      </div>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawWrapper />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
