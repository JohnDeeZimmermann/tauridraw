import { memo, useCallback, useEffect, useRef, useState } from "react";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import type { DocumentTabId, DocumentTabSummary } from "../data/documentTabs";
import type { WindowChromeColors } from "../windowChromeColors";

type DocumentTabsProps = {
  tabs: DocumentTabSummary[];
  activeTabId: DocumentTabId | null;
  chromeColors: WindowChromeColors;
  onSelectTab: (tabId: DocumentTabId) => void;
  onCloseTab: (tabId: DocumentTabId) => void;
  onReorderTab: (
    sourceTabId: DocumentTabId,
    targetTabId: DocumentTabId,
    position: "before" | "after",
  ) => void;
};

const DRAG_START_DISTANCE = 6;

export const DocumentTabs = memo(
  ({
    tabs,
    activeTabId,
    chromeColors,
    onSelectTab,
    onCloseTab,
    onReorderTab,
  }: DocumentTabsProps) => {
    const tabRefs = useRef(new Map<DocumentTabId, HTMLDivElement>());
    const suppressClickTabIdRef = useRef<DocumentTabId | null>(null);
    const cleanupDragRef = useRef<(() => void) | null>(null);
    const dropTargetRef = useRef<{
      tabId: DocumentTabId;
      position: "before" | "after";
    } | null>(null);
    const [draggedTabId, setDraggedTabId] = useState<DocumentTabId | null>(null);
    const [dropTargetTabId, setDropTargetTabId] = useState<DocumentTabId | null>(
      null,
    );
    const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(
      null,
    );

    const clearDragUI = useCallback(() => {
      setDraggedTabId(null);
      setDropTargetTabId(null);
      setDropPosition(null);
      dropTargetRef.current = null;
    }, []);

    useEffect(() => {
      return () => {
        cleanupDragRef.current?.();
      };
    }, []);

    const getDropTargetFromPointer = useCallback(
      (clientX: number, clientY: number) => {
        const tabRects = tabs
          .map((tab) => {
            const element = tabRefs.current.get(tab.id);
            if (!element) {
              return null;
            }
            return {
              tabId: tab.id,
              rect: element.getBoundingClientRect(),
            };
          })
          .filter((entry): entry is { tabId: DocumentTabId; rect: DOMRect } => {
            return entry !== null;
          });

        if (!tabRects.length) {
          return null;
        }

        const hovered = tabRects.find(({ rect }) => {
          return (
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom
          );
        });

        if (hovered) {
          return {
            tabId: hovered.tabId,
            position: clientX < hovered.rect.left + hovered.rect.width / 2
              ? "before"
              : "after",
          } as const;
        }

        const first = tabRects[0];
        if (clientX < first.rect.left) {
          return {
            tabId: first.tabId,
            position: "before",
          } as const;
        }

        const last = tabRects[tabRects.length - 1];
        if (clientX > last.rect.right) {
          return {
            tabId: last.tabId,
            position: "after",
          } as const;
        }

        return null;
      },
      [tabs],
    );

    const handlePointerDown = useCallback(
      (event: ReactPointerEvent<HTMLButtonElement>, tabId: DocumentTabId) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }

        cleanupDragRef.current?.();

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        let dragging = false;

        const cleanupListeners = () => {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerup", handlePointerUp);
          window.removeEventListener("pointercancel", handlePointerCancel);
          cleanupDragRef.current = null;
        };

        const handlePointerMove = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== pointerId) {
            return;
          }

          const distanceX = moveEvent.clientX - startX;
          const distanceY = moveEvent.clientY - startY;

          if (!dragging) {
            if (
              Math.hypot(distanceX, distanceY) < DRAG_START_DISTANCE
            ) {
              return;
            }
            dragging = true;
            setDraggedTabId(tabId);
          }

          const target = getDropTargetFromPointer(
            moveEvent.clientX,
            moveEvent.clientY,
          );

          if (!target) {
            dropTargetRef.current = null;
            setDropTargetTabId(null);
            setDropPosition(null);
            return;
          }

          dropTargetRef.current = target;
          setDropTargetTabId(target.tabId);
          setDropPosition(target.position);
        };

        const handlePointerUp = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== pointerId) {
            return;
          }

          cleanupListeners();

          if (!dragging) {
            return;
          }

          suppressClickTabIdRef.current = tabId;
          window.setTimeout(() => {
            if (suppressClickTabIdRef.current === tabId) {
              suppressClickTabIdRef.current = null;
            }
          }, 0);

          const target = dropTargetRef.current;
          clearDragUI();

          if (!target) {
            return;
          }

          onReorderTab(tabId, target.tabId, target.position);
        };

        const handlePointerCancel = (cancelEvent: PointerEvent) => {
          if (cancelEvent.pointerId !== pointerId) {
            return;
          }
          cleanupListeners();
          clearDragUI();
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        cleanupDragRef.current = cleanupListeners;
      },
      [clearDragUI, getDropTargetFromPointer, onReorderTab],
    );

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
              data-dragging={draggedTabId === tab.id ? "true" : "false"}
              data-drop-position={
                dropTargetTabId === tab.id && dropPosition
                  ? dropPosition
                  : "none"
              }
              ref={(element) => {
                if (element) {
                  tabRefs.current.set(tab.id, element);
                  return;
                }
                tabRefs.current.delete(tab.id);
              }}
            >
              <button
                type="button"
                role="tab"
                className="document-tabs__tab-button"
                aria-selected={isActive}
                onPointerDown={(event) => handlePointerDown(event, tab.id)}
                onClick={(event) => {
                  if (suppressClickTabIdRef.current === tab.id) {
                    event.preventDefault();
                    return;
                  }
                  onSelectTab(tab.id);
                }}
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
