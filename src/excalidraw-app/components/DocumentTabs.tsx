import { memo } from "react";

import type { CSSProperties } from "react";

import type { DocumentTabId, DocumentTabSummary } from "../data/documentTabs";
import type { WindowChromeColors } from "../windowChromeColors";

type DocumentTabsProps = {
  tabs: DocumentTabSummary[];
  activeTabId: DocumentTabId | null;
  chromeColors: WindowChromeColors;
  onSelectTab: (tabId: DocumentTabId) => void;
  onCloseTab: (tabId: DocumentTabId) => void;
};

export const DocumentTabs = memo(
  ({
    tabs,
    activeTabId,
    chromeColors,
    onSelectTab,
    onCloseTab,
  }: DocumentTabsProps) => {
    return (
      <div
        className="document-tabs"
        role="tablist"
        aria-label="Open documents"
        style={
          {
            "--document-tabs-bg": chromeColors.background,
            "--document-tabs-border": chromeColors.border,
            "--document-tab-bg": chromeColors.tabBackground,
            "--document-tab-bg-active": chromeColors.tabBackgroundActive,
            "--document-tab-fg": chromeColors.foreground,
            "--document-tab-fg-muted": chromeColors.mutedForeground,
          } as CSSProperties
        }
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;

          return (
            <div
              key={tab.id}
              className="document-tabs__tab"
              data-active={isActive ? "true" : "false"}
            >
              <button
                type="button"
                role="tab"
                className="document-tabs__tab-button"
                aria-selected={isActive}
                onClick={() => onSelectTab(tab.id)}
              >
                <span className="document-tabs__label">
                  {tab.isDirty && (
                    <span
                      className="document-tabs__dirty-indicator"
                      aria-hidden="true"
                    />
                  )}
                  <span className="document-tabs__label-text">
                    {tab.documentName}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="document-tabs__close"
                aria-label={`Close ${tab.documentName}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);
