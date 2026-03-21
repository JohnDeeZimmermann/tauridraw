import { restoreAppState } from "@excalidraw/excalidraw/data/restore";

import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { AppState } from "@excalidraw/excalidraw/types";

type LoadedSceneAppStateOptions = {
  sceneAppState: ImportedDataState["appState"];
  editorTheme: AppState["theme"];
  name?: AppState["name"];
  isLoading?: AppState["isLoading"];
};

export const getLoadedSceneAppState = ({
  sceneAppState,
  editorTheme,
  name,
  isLoading = false,
}: LoadedSceneAppStateOptions) => {
  const restoredAppState = restoreAppState(sceneAppState, null);

  return {
    ...restoredAppState,
    theme: editorTheme,
    isLoading,
    ...(name !== undefined ? { name } : {}),
  };
};
