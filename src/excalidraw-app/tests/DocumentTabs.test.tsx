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
  const mockWindowBarSettings = (
    mode: "custom" | "native",
    platform: "linux" | "windows" | "macos" = "linux",
  ) => {
    fileSystemMocks.getCurrentWindow.mockReturnValue({
      minimize: vi.fn(),
      close: vi.fn(),
      toggleMaximize: vi.fn(),
      startDragging: vi.fn(),
      startResizeDragging: vi.fn(),
      setCursorIcon: vi.fn(),
    } as any);
    fileSystemMocks.invoke.mockImplementation((command: string) => {
      if (command === "get_window_bar_settings") {
        return Promise.resolve({ mode, platform });
      }
      if (command === "set_window_bar_mode") {
        return Promise.resolve(null);
      }
      return Promise.resolve(null);
    });
  };

  const setTabRects = (tabWidth = 120, tabHeight = 32, startLeft = 16) => {
    const tabElements = Array.from(
      document.querySelectorAll<HTMLElement>(".document-tabs__tab"),
    );

    tabElements.forEach((tabElement, index) => {
      const left = startLeft + index * tabWidth;
      const right = left + tabWidth;
      const top = 8;
      const bottom = top + tabHeight;

      Object.defineProperty(tabElement, "getBoundingClientRect", {
        configurable: true,
        value: () =>
          ({
            x: left,
            y: top,
            left,
            right,
            top,
            bottom,
            width: tabWidth,
            height: tabHeight,
            toJSON: () => ({}),
          }) as DOMRect,
      });
    });
  };

  const dragTabByIndex = (
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) => {
    const tabButtons = screen.getAllByRole("tab");
    const sourceTab = tabButtons[sourceIndex];
    const tabElements = Array.from(
      document.querySelectorAll<HTMLElement>(".document-tabs__tab"),
    );
    const targetTab = tabElements[targetIndex];
    const targetRect = targetTab.getBoundingClientRect();
    const targetX =
      position === "before" ? targetRect.left + 2 : targetRect.right - 2;
    const targetY = targetRect.top + targetRect.height / 2;

    fireEvent.pointerDown(sourceTab, {
      pointerId: 101,
      pointerType: "mouse",
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 101,
      pointerType: "mouse",
      clientX: 30,
      clientY: 10,
    });
    fireEvent.pointerMove(window, {
      pointerId: 101,
      pointerType: "mouse",
      clientX: targetX,
      clientY: targetY,
    });
    fireEvent.pointerUp(window, {
      pointerId: 101,
      pointerType: "mouse",
      clientX: targetX,
      clientY: targetY,
    });
  };

  const createNamedTabs = async () => {
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", width: 100 })],
      appState: { name: "one" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /one/i })).toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(2));
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", width: 120 })],
      appState: { name: "two" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /two/i })).toBeInTheDocument(),
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(3));
    API.updateScene({
      elements: [API.createElement({ type: "rectangle", width: 140 })],
      appState: { name: "three" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
        ["one", "two", "three"],
      ),
    );
  };

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
    mockWindowBarSettings("custom");

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

  it("renders custom title bar and resize handles when startup mode is custom", async () => {
    mockWindowBarSettings("custom");
    await render(<ExcalidrawApp />);

    await waitFor(() =>
      expect(
        screen.getByRole("banner", { name: "Window title bar" }),
      ).toBeInTheDocument(),
    );
    expect(document.querySelector(".tauri-resize-handles")).not.toBeNull();
  });

  it("does not render custom title bar or resize handles when startup mode is native", async () => {
    mockWindowBarSettings("native");
    await render(<ExcalidrawApp />);

    await waitFor(() =>
      expect(
        screen.queryByRole("banner", { name: "Window title bar" }),
      ).toBeNull(),
    );
    expect(document.querySelector(".tauri-resize-handles")).toBeNull();
  });

  it("persists window bar preference from Preferences and shows restart toast without changing active chrome", async () => {
    mockWindowBarSettings("custom");
    await render(<ExcalidrawApp />);

    fireEvent.click(screen.getByRole("button", { name: "Preferences" }));
    const settingItem = await screen.findByText("Use custom window bar");
    fireEvent.click(settingItem);

    await waitFor(() =>
      expect(fileSystemMocks.invoke).toHaveBeenCalledWith(
        "set_window_bar_mode",
        { mode: "native" },
      ),
    );
    await screen.findByText(
      "Window bar preference saved. Restart tauridraw to apply.",
    );
    expect(
      screen.getByRole("banner", { name: "Window title bar" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".tauri-resize-handles")).not.toBeNull();
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

  it("reuses the untouched initial tab on new", async () => {
    await render(<ExcalidrawApp />);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });

    await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(1));
    expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
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

    API.updateScene({
      elements: [API.createElement({ type: "rectangle", width: 120 })],
      appState: { name: "seed" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /seed/i })).toBeInTheDocument(),
    );
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

    API.updateScene({
      elements: [API.createElement({ type: "rectangle", width: 120 })],
      appState: { name: "seed" },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /seed/i })).toBeInTheDocument(),
    );
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

  it("reorders tabs when dragging the active tab and keeps it active", async () => {
    await render(<ExcalidrawApp />);
    await createNamedTabs();
    setTabRects();

    dragTabByIndex(2, 0, "before");

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
        ["three", "one", "two"],
      ),
    );
    expect(screen.getByRole("tab", { name: "three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("reorders inactive tabs without switching active tab", async () => {
    await render(<ExcalidrawApp />);
    await createNamedTabs();

    fireEvent.click(screen.getByRole("tab", { name: "two" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "two" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );

    setTabRects();
    dragTabByIndex(0, 2, "after");

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
        ["two", "three", "one"],
      ),
    );
    expect(screen.getByRole("tab", { name: "two" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("does not reorder when dropping into an adjacent no-op position", async () => {
    await render(<ExcalidrawApp />);
    await createNamedTabs();
    setTabRects();

    dragTabByIndex(1, 0, "after");

    await waitFor(() =>
      expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(
        ["one", "two", "three"],
      ),
    );
    expect(screen.getByRole("tab", { name: "three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
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
