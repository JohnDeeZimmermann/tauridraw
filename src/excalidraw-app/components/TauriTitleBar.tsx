import type { CSSProperties } from "react";

import {
  closeWindow,
  minimizeWindow,
  setWindowCursor,
  toggleWindowMaximize,
} from "../tauri/windowChrome";
import type { DesktopPlatform } from "../tauri/windowChrome";
import type { WindowChromeColors } from "../windowChromeColors";

type TauriTitleBarProps = {
  title: string;
  subtitle?: string;
  chromeColors: WindowChromeColors;
  platform: DesktopPlatform;
};

export const TauriTitleBar = ({
  title,
  subtitle,
  chromeColors,
  platform,
}: TauriTitleBarProps) => {
  const isMacos = platform === "macos";

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
      {isMacos && (
        <div className="tauri-titlebar__mac-controls">
          <button
            type="button"
            className="tauri-titlebar__mac-control tauri-titlebar__mac-control--close"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              void closeWindow();
            }}
            aria-label="Close window"
            title="Close"
          />
          <button
            type="button"
            className="tauri-titlebar__mac-control tauri-titlebar__mac-control--minimize"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              void minimizeWindow();
            }}
            aria-label="Minimize window"
            title="Minimize"
          />
          <button
            type="button"
            className="tauri-titlebar__mac-control tauri-titlebar__mac-control--zoom"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              void toggleWindowMaximize();
            }}
            aria-label="Zoom window"
            title="Zoom"
          />
        </div>
      )}
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
      {!isMacos && (
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
      )}
    </div>
  );
};
