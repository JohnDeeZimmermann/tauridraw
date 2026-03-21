import { THEME, CaptureUpdateAction } from "@excalidraw/excalidraw";
import { applyDarkModeFilter } from "@excalidraw/common";
import { vi } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { UI } from "@excalidraw/excalidraw/tests/helpers/ui";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";
import { STORAGE_KEYS } from "../app_constants";
import { getWindowChromeColors } from "../windowChromeColors";

const fileSystemMocks = vi.hoisted(() => {
  return {
    pickNativeExcalidrawOpenPath: vi.fn(),
    loadNativeExcalidrawFile: vi.fn(),
    pickNativeExcalidrawSavePath: vi.fn(),
    saveNativeExcalidrawFile: vi.fn(),
    invoke: vi.fn(),
    getCurrentWindow: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: fileSystemMocks.invoke,
  };
});

vi.mock("@tauri-apps/api/window", () => {
  return {
    getCurrentWindow: fileSystemMocks.getCurrentWindow,
  };
});

vi.mock("../data/nativeFileSystem", () => {
  return {
    pickNativeExcalidrawOpenPath: fileSystemMocks.pickNativeExcalidrawOpenPath,
    loadNativeExcalidrawFile: fileSystemMocks.loadNativeExcalidrawFile,
    pickNativeExcalidrawSavePath: fileSystemMocks.pickNativeExcalidrawSavePath,
    saveNativeExcalidrawFile: fileSystemMocks.saveNativeExcalidrawFile,
  };
});

describe("document tabs", () => {
  beforeEach(() => {
    let storageState: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storageState[key] ?? null,
        setItem: (key: string, value: string) => {
          storageState[key] = String(value);
        },
        removeItem: (key: string) => {
          delete storageState[key];
        },
        clear: () => {
          storageState = {};
        },
      },
    });
    window.localStorage.removeItem(STORAGE_KEYS.LOCAL_STORAGE_THEME);
    fileSystemMocks.pickNativeExcalidrawOpenPath.mockReset();
    fileSystemMocks.loadNativeExcalidrawFile.mockReset();
    fileSystemMocks.pickNativeExcalidrawSavePath.mockReset();
    fileSystemMocks.saveNativeExcalidrawFile.mockReset();
    fileSystemMocks.invoke.mockReset();
    fileSystemMocks.getCurrentWindow.mockReset();
    fileSystemMocks.getCurrentWindow.mockImplementation(() => {
      throw new Error("not running in tauri");
    });
  });

  it("syncs the tab bar background to the active canvas color in light theme", async () => {
    await render(<ExcalidrawApp />);

    const canvasColor = "#ffd8a8";
    const expectedColors = getWindowChromeColors({
      theme: THEME.LIGHT,
      viewBackgroundColor: canvasColor,
    });

    API.updateScene({
      appState: { viewBackgroundColor: canvasColor },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(expectedColors.background),
    );
  });

  it("syncs the custom title bar and tab bar to the rendered canvas color in dark theme", async () => {
    window.localStorage.setItem(STORAGE_KEYS.LOCAL_STORAGE_THEME, THEME.DARK);
    fileSystemMocks.getCurrentWindow.mockReturnValue({} as any);
    fileSystemMocks.invoke.mockResolvedValue(true);

    await render(<ExcalidrawApp />);

    const rawCanvasColor = "#a5d8ff";
    const expectedColors = getWindowChromeColors({
      theme: THEME.DARK,
      viewBackgroundColor: rawCanvasColor,
    });

    API.updateScene({
      appState: { viewBackgroundColor: rawCanvasColor },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(expectedColors.background),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("banner")
          .style.getPropertyValue("--tauri-titlebar-bg"),
      ).toBe(expectedColors.background),
    );
    expect(expectedColors.background).toBe(applyDarkModeFilter(rawCanvasColor));
    expect(
      screen.getByRole("tablist").style.getPropertyValue("--document-tabs-bg"),
    ).not.toBe(rawCanvasColor);
  });

  it("restores each tab's unsaved canvas background color when switching tabs", async () => {
    await render(<ExcalidrawApp />);

    const firstCanvasColor = "#ffec99";
    const secondCanvasColor = "#eebefa";

    API.updateScene({
      appState: { viewBackgroundColor: firstCanvasColor },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(
        getWindowChromeColors({
          theme: THEME.LIGHT,
          viewBackgroundColor: firstCanvasColor,
        }).background,
      ),
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    API.updateScene({
      appState: { viewBackgroundColor: secondCanvasColor },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(
        getWindowChromeColors({
          theme: THEME.LIGHT,
          viewBackgroundColor: secondCanvasColor,
        }).background,
      ),
    );

    fireEvent.click(screen.getAllByRole("tab")[0]);

    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(
        getWindowChromeColors({
          theme: THEME.LIGHT,
          viewBackgroundColor: firstCanvasColor,
        }).background,
      ),
    );

    fireEvent.click(screen.getAllByRole("tab")[1]);

    await waitFor(() =>
      expect(
        screen
          .getByRole("tablist")
          .style.getPropertyValue("--document-tabs-bg"),
      ).toBe(
        getWindowChromeColors({
          theme: THEME.LIGHT,
          viewBackgroundColor: secondCanvasColor,
        }).background,
      ),
    );
  });

  it("starts with one tab and creates a second untitled tab on new", async () => {
    await render(<ExcalidrawApp />);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("closes a clean untouched tab without prompting", async () => {
    await render(<ExcalidrawApp />);

    fireEvent.click(screen.getByRole("button", { name: /close untitled/i }));

    await waitFor(() =>
      expect(screen.queryByText(/has unsaved changes/i)).toBeNull(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("opens a file in a new tab and focuses the existing tab on duplicate open", async () => {
    await render(<ExcalidrawApp />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    fileSystemMocks.pickNativeExcalidrawOpenPath.mockResolvedValue(
      "/tmp/opened.excalidraw",
    );
    fileSystemMocks.loadNativeExcalidrawFile.mockResolvedValue({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: {
        elements: [],
        appState: null,
        files: {},
      },
    });

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(fileSystemMocks.loadNativeExcalidrawFile).toHaveBeenCalledTimes(1),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("reuses the untouched initial tab when opening a file", async () => {
    await render(<ExcalidrawApp />);

    fileSystemMocks.pickNativeExcalidrawOpenPath.mockResolvedValue(
      "/tmp/opened.excalidraw",
    );
    fileSystemMocks.loadNativeExcalidrawFile.mockResolvedValue({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: {
        elements: [],
        appState: null,
        files: {},
      },
    });

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });

  it("keeps the initial tab when it has changes before opening a file", async () => {
    await render(<ExcalidrawApp />);

    const rectangle = API.createElement({ type: "rectangle", width: 120 });
    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    fileSystemMocks.pickNativeExcalidrawOpenPath.mockResolvedValue(
      "/tmp/opened.excalidraw",
    );
    fileSystemMocks.loadNativeExcalidrawFile.mockResolvedValue({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: {
        elements: [],
        appState: null,
        files: {},
      },
    });

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("keeps the opened file tab when creating a new document after reusing the initial tab", async () => {
    await render(<ExcalidrawApp />);

    fileSystemMocks.pickNativeExcalidrawOpenPath.mockResolvedValue(
      "/tmp/opened.excalidraw",
    );
    fileSystemMocks.loadNativeExcalidrawFile.mockResolvedValue({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: {
        elements: [],
        appState: null,
        files: {},
      },
    });

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /opened/i })).toHaveTextContent(
      "opened",
    );
  });

  it("keeps each tab label when switching away from an opened file", async () => {
    await render(<ExcalidrawApp />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    fileSystemMocks.pickNativeExcalidrawOpenPath.mockResolvedValue(
      "/tmp/opened.excalidraw",
    );
    fileSystemMocks.loadNativeExcalidrawFile.mockResolvedValue({
      filePath: "/tmp/opened.excalidraw",
      documentName: "opened",
      scene: {
        elements: [],
        appState: null,
        files: {},
      },
    });

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    fireEvent.click(screen.getAllByRole("tab")[0]);

    await waitFor(() =>
      expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByRole("tab", { name: /opened/i })).toHaveTextContent(
      "opened",
    );
  });

  it("keeps each tab scene in memory when switching tabs", async () => {
    await render(<ExcalidrawApp />);

    const rectangle = API.createElement({ type: "rectangle", width: 120 });
    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    expect(window.h.elements).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("tab")[0]);

    await waitFor(() => expect(window.h.elements).toHaveLength(1));
    expect(window.h.elements[0].id).toBe(rectangle.id);
  });

  it.skip("prompts before closing a dirty tab and replaces the last tab after discard", async () => {
    await render(<ExcalidrawApp />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));

    UI.createElement("rectangle", { width: 120, height: 80 });
    await waitFor(() =>
      expect(
        document.querySelectorAll(".document-tabs__dirty-indicator"),
      ).toHaveLength(1),
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /close untitled/i })[1],
    );

    await waitFor(() =>
      expect(screen.getByText(/has unsaved changes/i)).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText(/has unsaved changes/i)).toBeNull(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    fireEvent.click(
      screen.getAllByRole("button", { name: /close untitled/i })[1],
    );
    await waitFor(() =>
      expect(screen.getByText(/has unsaved changes/i)).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Don't Save" }));

    await waitFor(() =>
      expect(screen.queryByText(/has unsaved changes/i)).toBeNull(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
