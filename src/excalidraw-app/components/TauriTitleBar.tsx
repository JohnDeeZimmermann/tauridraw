import type { CSSProperties } from "react";

import {
  closeWindow,
  setWindowCursor,
  toggleWindowMaximize,
} from "../tauri/windowChrome";
import type { WindowChromeColors } from "../windowChromeColors";

type TauriTitleBarProps = {
  title: string;
  subtitle?: string;
  chromeColors: WindowChromeColors;
};

export const TauriTitleBar = ({
  title,
  subtitle,
  chromeColors,
}: TauriTitleBarProps) => {
  return (
    <div
      className="tauri-titlebar"
      role="banner"
      aria-label="Window title bar"
      style={
        {
          "--tauri-titlebar-bg": chromeColors.background,
          "--tauri-titlebar-fg": chromeColors.foreground,
          "--tauri-titlebar-muted": chromeColors.mutedForeground,
          "--tauri-titlebar-border": chromeColors.border,
          "--tauri-titlebar-dot": chromeColors.dotBackground,
          "--tauri-titlebar-dot-ring": chromeColors.dotRing,
          "--tauri-titlebar-close-hover": chromeColors.closeHoverBackground,
        } as CSSProperties
      }
    >
      <div
        className="tauri-titlebar__drag-region"
        data-tauri-drag-region
        onMouseDown={(event) => {
          if (event.button !== 0 || event.detail < 2) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          void toggleWindowMaximize();
        }}
        onMouseEnter={() => {
          void setWindowCursor("default");
        }}
      >
        <div className="tauri-titlebar__identity" data-tauri-drag-region>
          <span className="tauri-titlebar__dot" aria-hidden="true" />
          <div className="tauri-titlebar__text" data-tauri-drag-region>
            <span className="tauri-titlebar__title" data-tauri-drag-region>
              {title}
            </span>
            {subtitle ? (
              <span className="tauri-titlebar__subtitle" data-tauri-drag-region>
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="tauri-titlebar__close"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={() => {
          void closeWindow();
        }}
        aria-label="Close window"
        title="Close"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
};
