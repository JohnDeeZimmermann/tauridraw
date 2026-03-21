import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { vi } from "vitest";

import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@excalidraw/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";

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

vi.mock(
  "@tauri-apps/api/core",
  () => {
    return {
      invoke: fileSystemMocks.invoke,
    };
  },
);

vi.mock(
  "@tauri-apps/api/window",
  () => {
    return {
      getCurrentWindow: fileSystemMocks.getCurrentWindow,
    };
  },
);

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

  it("opens a file in a new tab and focuses the existing tab on duplicate open", async () => {
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
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    fireEvent.keyDown(window, { key: "o", ctrlKey: true });

    await waitFor(() =>
      expect(fileSystemMocks.loadNativeExcalidrawFile).toHaveBeenCalledTimes(1),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: /opened/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps each tab label when switching away from an opened file", async () => {
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

    fireEvent.click(screen.getAllByRole("tab")[0]);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /untitled/i })).toHaveAttribute(
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

  it("prompts before closing a dirty tab and replaces the last tab after discard", async () => {
    await render(<ExcalidrawApp />);

    const rectangle = API.createElement({ type: "rectangle", width: 120 });
    API.updateScene({
      elements: [rectangle],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

    fireEvent.click(screen.getByRole("button", { name: /close untitled/i }));

    await waitFor(() =>
      expect(screen.getByText(/has unsaved changes/i)).not.toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText(/has unsaved changes/i)).toBeNull(),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /close untitled/i }));
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
