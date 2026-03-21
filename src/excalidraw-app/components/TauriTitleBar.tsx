import {
  closeWindow,
  startWindowDrag,
  setWindowCursor,
  toggleWindowMaximize,
} from "../tauri/windowChrome";

type TauriTitleBarProps = {
  title: string;
  subtitle?: string;
  theme: "light" | "dark";
};

export const TauriTitleBar = ({
  title,
  subtitle,
  theme,
}: TauriTitleBarProps) => {
  return (
    <div
      className="tauri-titlebar"
      data-theme={theme}
      role="banner"
      aria-label="Window title bar"
    >
      <div
        className="tauri-titlebar__drag-region"
        data-tauri-drag-region
        onMouseDown={(event) => {
          if (event.button !== 0 || event.detail > 1) {
            return;
          }
          void startWindowDrag();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
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
