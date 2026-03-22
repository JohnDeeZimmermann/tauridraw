import {
  eyeIcon,
  file,
  LoadIcon,
  save,
  saveAs,
} from "@excalidraw/excalidraw/components/icons";
import DropdownMenu from "@excalidraw/excalidraw/components/dropdownMenu/DropdownMenu";
import DropdownMenuItemCheckbox from "@excalidraw/excalidraw/components/dropdownMenu/DropdownMenuItemCheckbox";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { useI18n } from "@excalidraw/excalidraw/i18n";
import React from "react";
import { createPortal } from "react-dom";

import { isDevEnv } from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";
import type { WindowBarMode } from "../tauri/windowChrome";

import { LanguageList } from "../app-language/LanguageList";

import { saveDebugState } from "./DebugCanvas";

export const AppMainMenu: React.FC<{
  menuBarContainer: HTMLElement | null;
  theme: Theme | "system";
  setTheme: (theme: Theme | "system") => void;
  refresh: () => void;
  onNewDocument: () => void;
  onOpenDocument: () => void;
  onSaveDocument: () => void;
  onSaveAsDocument: () => void;
  showWindowBarPreference: boolean;
  windowBarMode: WindowBarMode;
  onWindowBarModeChange: (mode: WindowBarMode) => void;
}> = React.memo((props) => {
  const { t } = useI18n();
  const [openDesktopMenu, setOpenDesktopMenu] = React.useState<
    "file" | "edit" | "view" | "preferences" | "help" | null
  >(null);

  const renderDesktopMenu = (
    id: "file" | "edit" | "view" | "preferences" | "help",
    title: string,
    children: React.ReactNode,
  ) => {
    const isOpen = openDesktopMenu === id;

    return (
      <div
        className="desktop-menu-bar__menu"
        key={id}
        onMouseEnter={() => {
          if (openDesktopMenu !== null && openDesktopMenu !== id) {
            setOpenDesktopMenu(id);
          }
        }}
      >
        <DropdownMenu open={isOpen}>
          <DropdownMenu.Trigger
            className="desktop-menu-bar__trigger"
            onToggle={() => {
              setOpenDesktopMenu((current) => (current === id ? null : id));
            }}
          >
            {title}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            className="desktop-menu-bar__dropdown main-menu"
            align="start"
            onClickOutside={() => {
              setOpenDesktopMenu(null);
            }}
            onSelect={() => {
              setOpenDesktopMenu(null);
            }}
          >
            {children}
          </DropdownMenu.Content>
        </DropdownMenu>
      </div>
    );
  };

  const desktopMenuBar = props.menuBarContainer
    ? createPortal(
        <div className="desktop-menu-bar" role="menubar" aria-label="Application menu">
          {renderDesktopMenu(
            "file",
            "File",
            <>
              <MainMenu.Item
                icon={file}
                onSelect={props.onNewDocument}
                shortcut="Ctrl+N"
              >
                New
              </MainMenu.Item>
              <MainMenu.Item
                icon={LoadIcon}
                onSelect={props.onOpenDocument}
                shortcut="Ctrl+O"
              >
                {t("buttons.load")}
              </MainMenu.Item>
              <MainMenu.Item
                icon={save}
                onSelect={props.onSaveDocument}
                shortcut="Ctrl+S"
              >
                {t("buttons.save")}
              </MainMenu.Item>
              <MainMenu.Item
                icon={saveAs}
                onSelect={props.onSaveAsDocument}
                shortcut="Ctrl+Shift+S"
              >
                {t("buttons.saveAs")}
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
            </>,
          )}
          {renderDesktopMenu(
            "edit",
            "Edit",
            <>
              <MainMenu.DefaultItems.CommandPalette className="highlighted" />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ClearCanvas />
            </>,
          )}
          {renderDesktopMenu(
            "view",
            "View",
            <>
              <MainMenu.DefaultItems.ToggleTheme
                allowSystemTheme
                theme={props.theme}
                onSelect={props.setTheme}
              />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              {isDevEnv() && (
                <>
                  <MainMenu.Separator />
                  <MainMenu.Item
                    icon={eyeIcon}
                    onSelect={() => {
                      if (window.visualDebug) {
                        delete window.visualDebug;
                        saveDebugState({ enabled: false });
                      } else {
                        window.visualDebug = { data: [] };
                        saveDebugState({ enabled: true });
                      }
                      props?.refresh();
                    }}
                  >
                    Visual Debug
                  </MainMenu.Item>
                </>
              )}
            </>,
          )}
          {renderDesktopMenu(
            "preferences",
            "Preferences",
            <>
              <MainMenu.DefaultItems.Preferences.ToggleToolLock />
              <MainMenu.DefaultItems.Preferences.ToggleSnapMode />
              <MainMenu.DefaultItems.Preferences.ToggleGridMode />
              <MainMenu.DefaultItems.Preferences.ToggleZenMode />
              <MainMenu.DefaultItems.Preferences.ToggleViewMode />
              <MainMenu.DefaultItems.Preferences.ToggleElementProperties />
              {props.showWindowBarPreference ? (
                <DropdownMenuItemCheckbox
                  checked={props.windowBarMode === "custom"}
                  onSelect={() => {
                    props.onWindowBarModeChange(
                      props.windowBarMode === "custom" ? "native" : "custom",
                    );
                  }}
                >
                  Use custom window bar
                </DropdownMenuItemCheckbox>
              ) : null}
              <MainMenu.Separator />
              <MainMenu.ItemCustom>
                <LanguageList style={{ width: "100%" }} />
              </MainMenu.ItemCustom>
            </>,
          )}
          {renderDesktopMenu(
            "help",
            "Help",
            <>
              <MainMenu.DefaultItems.Help />
            </>,
          )}
        </div>,
        props.menuBarContainer,
      )
    : null;

  return (
    <>
      <MainMenu hideTrigger />
      {desktopMenuBar}
    </>
  );
});
