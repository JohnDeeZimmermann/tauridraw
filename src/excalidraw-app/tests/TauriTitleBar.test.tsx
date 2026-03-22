import { vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
} from "@excalidraw/excalidraw/tests/test-utils";

import { TauriTitleBar } from "../components/TauriTitleBar";

const windowChromeMocks = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  minimizeWindow: vi.fn(),
  setWindowCursor: vi.fn(),
  toggleWindowMaximize: vi.fn(),
}));

vi.mock("../tauri/windowChrome", () => {
  return {
    closeWindow: windowChromeMocks.closeWindow,
    minimizeWindow: windowChromeMocks.minimizeWindow,
    setWindowCursor: windowChromeMocks.setWindowCursor,
    toggleWindowMaximize: windowChromeMocks.toggleWindowMaximize,
  };
});

const chromeColors = {
  background: "#eceff4",
  foreground: "#1c2430",
  mutedForeground: "rgba(28, 36, 48, 0.62)",
  border: "rgba(28, 36, 48, 0.1)",
  dotBackground: "#999ea6",
  dotRing: "rgba(28, 36, 48, 0.16)",
  closeHoverBackground: "#d93025",
  tabBackground: "rgba(28, 36, 48, 0.04)",
  tabBackgroundActive: "rgba(28, 36, 48, 0.1)",
};

describe("TauriTitleBar", () => {
  beforeEach(() => {
    windowChromeMocks.closeWindow.mockReset();
    windowChromeMocks.minimizeWindow.mockReset();
    windowChromeMocks.setWindowCursor.mockReset();
    windowChromeMocks.toggleWindowMaximize.mockReset();
  });

  it("renders macOS traffic lights and wires close/minimize/zoom", () => {
    render(
      <TauriTitleBar
        platform="macos"
        title="tauridraw"
        subtitle="document"
        chromeColors={chromeColors}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close window" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom window" }));

    expect(windowChromeMocks.closeWindow).toHaveBeenCalledTimes(1);
    expect(windowChromeMocks.minimizeWindow).toHaveBeenCalledTimes(1);
    expect(windowChromeMocks.toggleWindowMaximize).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(".tauri-titlebar__mac-control")).toHaveLength(
      3,
    );
  });

  it("renders minimal controls on linux", () => {
    render(
      <TauriTitleBar
        platform="linux"
        title="tauridraw"
        subtitle="document"
        chromeColors={chromeColors}
      />,
    );

    expect(screen.getByRole("button", { name: "Close window" })).toBeInTheDocument();
    expect(document.querySelector(".tauri-titlebar__mac-controls")).toBeNull();

  });

  it("renders minimal controls on windows", () => {
    render(
      <TauriTitleBar
        platform="windows"
        title="tauridraw"
        subtitle="document"
        chromeColors={chromeColors}
      />,
    );

    expect(screen.getByRole("button", { name: "Close window" })).toBeInTheDocument();
    expect(document.querySelector(".tauri-titlebar__mac-controls")).toBeNull();
  });
});
