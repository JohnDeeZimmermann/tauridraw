import {
  Excalidraw,
  CaptureUpdateAction,
  reconcileElements,
  useEditorInterface,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import { ShareableLinkDialog } from "@excalidraw/excalidraw/components/ShareableLinkDialog";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  getVersion,
  getFrame,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
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
  bumpElementVersions,
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  ExcalidrawElement,
  FileId,
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
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";
import { updateStaleImageStatuses } from "./data/FileManager";
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
  openNativeExcalidrawFile,
  saveNativeExcalidrawFile,
  saveNativeExcalidrawFileAs,
} from "./data/nativeFileSystem";
import { getLoadedSceneAppState } from "./sceneAppState";
import { getUseCustomTitlebar } from "./tauri/windowChrome";

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

const DEFAULT_DOCUMENT_NAME = "Untitled";

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

const initializeScene = async (opts: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    { isExternalScene: boolean }
  )
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

const ExcalidrawWrapper = () => {
  const [errorMessage, setErrorMessage] = useState("");
  const [useCustomTitlebar, setUseCustomTitlebar] = useState(false);

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode] = useAppLangCode();

  const editorInterface = useEditorInterface();

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
  const getSceneAppStateForCurrentTheme = useEffectEvent(
    (
      sceneAppState: RestoredDataState["appState"],
      name?: AppState["name"],
    ) =>
      getLoadedSceneAppState({
        sceneAppState,
        editorTheme,
        name,
      }),
  );

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState(DEFAULT_DOCUMENT_NAME);
  const [isDirty, setIsDirty] = useState(false);
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
    void runAsProgrammaticSceneMutation(async () => {
      excalidrawAPI.updateScene({
        appState: { name: DEFAULT_DOCUMENT_NAME },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
  }, [excalidrawAPI, runAsProgrammaticSceneMutation]);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    initializeScene({ excalidrawAPI }).then((data) => {
      initialStatePromiseRef.current.promise.resolve(data.scene);
      setActiveFilePath(null);
      setIsDirty(false);
      setDocumentName(
        data.scene?.appState?.name?.trim() || DEFAULT_DOCUMENT_NAME,
      );
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ excalidrawAPI }).then((data) => {
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: getSceneAppStateForCurrentTheme(
                data.scene.appState,
                data.scene.appState?.name?.trim() || DEFAULT_DOCUMENT_NAME,
              ),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
          setActiveFilePath(null);
          setIsDirty(false);
          setDocumentName(
            data.scene?.appState?.name?.trim() || DEFAULT_DOCUMENT_NAME,
          );
        });
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (programmaticChangeDepthRef.current === 0) {
      setIsDirty(true);
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

  const handleNewDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    await runAsProgrammaticSceneMutation(async () => {
      excalidrawAPI.resetScene({ resetLoadingState: true });
      excalidrawAPI.updateScene({
        appState: { name: DEFAULT_DOCUMENT_NAME },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    });
    setActiveFilePath(null);
    setDocumentName(DEFAULT_DOCUMENT_NAME);
    setIsDirty(false);
  }, [excalidrawAPI, runAsProgrammaticSceneMutation]);

  const handleOpenDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    try {
      const result = await openNativeExcalidrawFile();
      if (!result) {
        return;
      }
      const restoredElements = markSavedImageElements(
        result.scene.elements,
        result.scene.files,
      );
      await runAsProgrammaticSceneMutation(async () => {
        excalidrawAPI.resetScene({ resetLoadingState: true });
        const filesToAdd = Object.values(result.scene.files);
        if (filesToAdd.length) {
          excalidrawAPI.addFiles(filesToAdd);
        }
        excalidrawAPI.updateScene({
          elements: restoredElements,
          appState: getLoadedSceneAppState({
            sceneAppState: result.scene.appState,
            editorTheme,
            name: result.documentName,
          }),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        excalidrawAPI.history.clear();
      });
      setActiveFilePath(result.filePath);
      setDocumentName(result.documentName);
      setIsDirty(false);
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to open file");
    }
  }, [editorTheme, excalidrawAPI, runAsProgrammaticSceneMutation]);

  const handleSaveAsDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return false;
    }

    try {
      const result = await saveNativeExcalidrawFileAs({
        suggestedName: excalidrawAPI.getName() || documentName,
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
      });
      if (!result) {
        return false;
      }
      await runAsProgrammaticSceneMutation(async () => {
        excalidrawAPI.updateScene({
          appState: { name: result.documentName },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      });
      setActiveFilePath(result.filePath);
      setDocumentName(result.documentName);
      setIsDirty(false);
      return true;
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to save file");
      return false;
    }
  }, [documentName, excalidrawAPI, runAsProgrammaticSceneMutation]);

  const handleSaveDocument = useCallback(async () => {
    if (!excalidrawAPI) {
      return;
    }
    if (!activeFilePath) {
      await handleSaveAsDocument();
      return;
    }

    try {
      const result = await saveNativeExcalidrawFile({
        filePath: activeFilePath,
        elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
        appState: excalidrawAPI.getAppState(),
        files: excalidrawAPI.getFiles(),
      });
      await runAsProgrammaticSceneMutation(async () => {
        excalidrawAPI.updateScene({
          appState: { name: result.documentName },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      });
      setActiveFilePath(result.filePath);
      setDocumentName(result.documentName);
      setIsDirty(false);
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to save file");
    }
  }, [
    activeFilePath,
    excalidrawAPI,
    handleSaveAsDocument,
    runAsProgrammaticSceneMutation,
  ]);

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
          subtitle={documentName}
          theme={editorTheme}
        />
      )}
      {useCustomTitlebar && <TauriResizeHandles />}
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
        <AppWelcomeScreen
          onOpenDocument={() => void handleOpenDocument()}
        />
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
              keywords: ["features", "tutorials", "howto", "help", "community"],
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
