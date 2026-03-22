import { vi } from "vitest";

const tauriMocks = vi.hoisted(() => {
  return {
    invoke: vi.fn(),
    getCurrentWindow: vi.fn(),
  };
});

vi.mock("@tauri-apps/api/core", () => {
  return {
    invoke: tauriMocks.invoke,
  };
});

vi.mock("@tauri-apps/api/window", () => {
  return {
    getCurrentWindow: tauriMocks.getCurrentWindow,
  };
});

import { closeWindow } from "../tauri/windowChrome";

describe("windowChrome", () => {
  beforeEach(() => {
    tauriMocks.invoke.mockReset();
    tauriMocks.getCurrentWindow.mockReset();
  });

  it("closes the current window when running in tauri", async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    tauriMocks.getCurrentWindow.mockReturnValue({
      close,
    } as any);

    await closeWindow();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not force-destroy the window if close fails", async () => {
    const close = vi.fn().mockRejectedValue(new Error("already closing"));
    const destroy = vi.fn().mockResolvedValue(undefined);

    tauriMocks.getCurrentWindow.mockReturnValue({
      close,
      destroy,
    } as any);

    await expect(closeWindow()).resolves.toBeUndefined();

    expect(close).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("noops when there is no tauri window context", async () => {
    tauriMocks.getCurrentWindow.mockImplementation(() => {
      throw new Error("not running in tauri");
    });

    await expect(closeWindow()).resolves.toBeUndefined();
  });
});
