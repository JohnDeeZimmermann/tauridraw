import { THEME } from "@excalidraw/excalidraw";

import { getLoadedSceneAppState } from "../sceneAppState";

describe("getLoadedSceneAppState", () => {
  it("preserves the active editor theme when loading a saved scene", () => {
    const appState = getLoadedSceneAppState({
      sceneAppState: {
        theme: THEME.LIGHT,
        viewBackgroundColor: "#ffffff",
        name: "Saved scene name",
      },
      editorTheme: THEME.DARK,
      name: "Opened document",
    });

    expect(appState.theme).toBe(THEME.DARK);
    expect(appState.name).toBe("Opened document");
    expect(appState.viewBackgroundColor).toBe("#ffffff");
    expect(appState.isLoading).toBe(false);
  });
});
