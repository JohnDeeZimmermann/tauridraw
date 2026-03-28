# Code Blocks: Technical Notes

This document captures the current code-block implementation so future changes can stay consistent and avoid regressions.

## Core Model

- A code block is **not** a separate element type; it is a `text` element with `customData.kind === "code"`.
- Type guard: `isCodeElement()` in `src/packages/element/src/typeChecks.ts`.
- Code metadata currently uses:
  - `customData.kind = "code"`
  - `customData.language = "python"` (default)

Why this model:
- Reuses existing text element lifecycle (selection, movement, resize, serialization, collaboration).
- Minimizes blast radius versus introducing a new top-level element type.

## Invariants (Important)

These are enforced in multiple paths and should be preserved:

- `fontFamily` is fixed to `FONT_FAMILY.Cascadia` for code blocks.
- `textAlign` is fixed to `"left"` for code blocks.
- `autoResize` is forced to `true` for code blocks.
- `customData.language` is normalized to `"python"` when missing.

Normalization points:
- During edit updates in `src/packages/excalidraw/components/App.tsx` (`handleTextWysiwyg` path).
- During restore/import in `src/packages/excalidraw/data/restore.ts`.

## Tooling and AppState Integration

- `ToolType` includes `"code"` in `src/packages/excalidraw/types.ts`.
- `TOOL_TYPE.code` exists in `src/packages/common/src/constants.ts`.
- Toolbar registration (desktop/mobile) is in `src/packages/excalidraw/components/shapes.tsx` and `src/packages/excalidraw/components/MobileToolBar.tsx`.
- Restore allows active tool `code` via `AllowedExcalidrawActiveTools` in `src/packages/excalidraw/data/restore.ts`.

Creation flow:
- `startTextEditing({ isCode: true })` in `src/packages/excalidraw/components/App.tsx` creates a text element with code defaults and code metadata.

## Editing (WYSIWYG)

Main implementation: `src/packages/excalidraw/wysiwyg/textWysiwyg.tsx`.

### Live Highlight Architecture

- Editor is still a `<textarea>` for caret/input behavior.
- For code blocks only, a `<pre>` overlay is added behind it.
- Textarea text is made transparent while caret stays visible (`caretColor` set explicitly).
- Overlay HTML is regenerated on every input/theme/style update using tokenized spans.
- Textarea and overlay scroll positions are synchronized.

CSS hooks:
- `src/packages/excalidraw/css/styles.scss`
  - `.excalidraw-wysiwyg--code`
  - `.excalidraw-wysiwyg-code`

### Auto-indent Behavior

- On `Enter` in code mode:
  - Preserve leading spaces from current line.
  - If trimmed current line ends with `:`, add one extra indent unit (`4` spaces).
- Implemented in `insertNewlineWithIndent()` inside `textWysiwyg.tsx`.

## Syntax Highlighting Engine

File: `src/packages/element/src/codeHighlighting.ts`.

Tokenizer is intentionally lightweight and line-based:
- Token types: `plain`, `keyword`, `string`, `comment`, `number`, `function`.
- Python-like keyword set.
- Comments start with `#`.
- Strings support `'`/`"` with escaped chars.
- Functions are detected heuristically as identifiers followed by `(` (ignoring spaces).

Palette:
- `getCodeTokenPalette(theme, fallbackColor)` returns light/dark token colors.
- `fallbackColor` is always the element stroke color after dark-mode filtering.

HTML highlighting helper:
- `highlightCodeAsHtml(code, palette)` (used by WYSIWYG overlay).

## Rendering Paths

### Canvas Rendering

File: `src/packages/element/src/renderElement.ts`.

- Non-code text: standard `fillText` line rendering.
- Code text:
  - Split into lines.
  - Tokenize each line.
  - Measure token widths and draw token-by-token with palette colors.
  - Respect text alignment by computing `startX` from full-line width first.

### SVG Export Rendering

File: `src/packages/excalidraw/renderer/staticSvgScene.ts`.

- Non-code text: line text content directly.
- Code text:
  - Tokenize each line.
  - Emit `<tspan>` per token with per-token `fill` color.
  - Preserve alignment and line metrics consistent with text rendering pipeline.

## Style Panel and Property Constraints

Behavior is intentionally different for code blocks:

- Font family selector is hidden for code blocks.
- Stroke color selector is hidden for code blocks.
- These UI constraints live in `src/packages/excalidraw/components/Actions.tsx`.

Action-layer guards (defense in depth):
- `changeStrokeColor` skips code elements.
- `changeFontFamily` skips code elements.
- Implemented in `src/packages/excalidraw/actions/actionProperties.tsx`.

This prevents accidental updates from command palette/actions/plugins even if UI logic changes.

## Default Font Policy

- App-wide default text font is now `Comic Shanns` (`DEFAULT_FONT_FAMILY`) in `src/packages/common/src/constants.ts`.
- Code blocks still force `Cascadia` through code-block normalization and creation logic.

## Extension Guide (When Adding Features)

When implementing any new text-related feature, check both `isTextElement` and `isCodeElement` behavior.

Recommended checklist:

1. Creation: should code tool inherit the feature or remain fixed?
2. Editing: should feature apply inside code WYSIWYG overlay?
3. Rendering: ensure both canvas and SVG behavior are consistent.
4. Restore/import: normalize/repair persisted code metadata if needed.
5. Actions/panel: ensure code-specific restrictions remain enforced.
6. Keyboard shortcuts: avoid conflicts with code editing semantics.

## Known Limitations

- Tokenizer is heuristic and not a full parser.
- No language switcher yet; language is stored but effectively fixed to Python-like highlighting.
- No dedicated code container visuals (padding/background) beyond syntax coloring.
- Triple-quoted/multiline-string edge cases are not fully language-accurate.
