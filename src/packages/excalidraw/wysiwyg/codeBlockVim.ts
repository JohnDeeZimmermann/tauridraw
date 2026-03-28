const WORD_CHAR = /[A-Za-z0-9_]/;

export type CodeBlockVimMode =
  | "insert"
  | "normal"
  | "visual"
  | "visualBlock";

type LineColumn = {
  line: number;
  column: number;
};

type CharMotion = "f" | "F" | "t" | "T";

type PendingOperator = "y" | "d" | "c";

type PendingCharMotion = {
  motion: CharMotion;
  operatorStart: number | null;
  operator: PendingOperator | null;
};

type CreateCodeBlockVimControllerOptions = {
  editable: HTMLTextAreaElement;
  initialMode: CodeBlockVimMode;
  onSubmit: () => void;
  onTextChange: () => void;
  onModeChange?: (mode: CodeBlockVimMode) => void;
  onSelectionChange?: (selectionStart: number, selectionEnd: number) => void;
  readClipboardText: () => Promise<string | null>;
  writeClipboardText: (text: string) => Promise<void>;
};

export type CodeBlockVimController = {
  handleKeyDown: (event: KeyboardEvent) => boolean;
  getMode: () => CodeBlockVimMode;
  destroy: () => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isWhitespace = (char: string | undefined) => !!char && /\s/.test(char);

const isWordChar = (char: string | undefined) => !!char && WORD_CHAR.test(char);

const isPrintableKey = (event: KeyboardEvent) =>
  event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

const getLineStarts = (value: string): number[] => {
  const starts = [0];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
};

const getLineIndexAtOffset = (lineStarts: number[], offset: number) => {
  if (lineStarts.length === 1) {
    return 0;
  }

  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = lineStarts[middle];
    const nextLineStart =
      middle + 1 < lineStarts.length ? lineStarts[middle + 1] : Infinity;

    if (offset < lineStart) {
      high = middle - 1;
    } else if (offset >= nextLineStart) {
      low = middle + 1;
    } else {
      return middle;
    }
  }

  return lineStarts.length - 1;
};

const getLineEndOffset = (value: string, lineStart: number) => {
  const lineBreak = value.indexOf("\n", lineStart);
  return lineBreak === -1 ? value.length : lineBreak;
};

const getCurrentLineRange = (value: string, offset: number) => {
  const safeOffset = clamp(offset, 0, value.length);
  const lineStart = value.lastIndexOf("\n", Math.max(0, safeOffset - 1)) + 1;
  const lineBreak = value.indexOf("\n", safeOffset);
  const lineEnd = lineBreak === -1 ? value.length : lineBreak;
  const lineEndWithBreak = lineBreak === -1 ? lineEnd : lineBreak + 1;
  return {
    lineStart,
    lineEnd,
    lineEndWithBreak,
  };
};

const getLineColumnFromOffset = (value: string, offset: number): LineColumn => {
  const safeOffset = clamp(offset, 0, value.length);
  const lineStarts = getLineStarts(value);
  const line = getLineIndexAtOffset(lineStarts, safeOffset);
  const lineStart = lineStarts[line] ?? 0;
  const lineEnd = getLineEndOffset(value, lineStart);
  return {
    line,
    column: clamp(safeOffset - lineStart, 0, lineEnd - lineStart),
  };
};

const getOffsetFromLineColumn = (
  value: string,
  lineColumn: LineColumn,
): number => {
  const lineStarts = getLineStarts(value);
  const safeLine = clamp(lineColumn.line, 0, lineStarts.length - 1);
  const lineStart = lineStarts[safeLine] ?? 0;
  const lineEnd = getLineEndOffset(value, lineStart);
  const maxColumn = lineEnd - lineStart;
  const safeColumn = clamp(lineColumn.column, 0, maxColumn);
  return lineStart + safeColumn;
};

const moveWordForwardStart = (value: string, offset: number, bigWord: boolean) => {
  let index = clamp(offset, 0, value.length);
  if (index >= value.length) {
    return value.length;
  }

  const classify = (char: string | undefined) => {
    if (isWhitespace(char)) {
      return "space";
    }
    if (bigWord) {
      return "word";
    }
    if (isWordChar(char)) {
      return "word";
    }
    return "punctuation";
  };

  const currentClass = classify(value[index]);

  while (index < value.length && classify(value[index]) === currentClass) {
    index++;
  }
  while (index < value.length && isWhitespace(value[index])) {
    index++;
  }

  return index;
};

const moveWordBackwardStart = (
  value: string,
  offset: number,
  bigWord: boolean,
) => {
  let index = clamp(offset, 0, value.length);
  if (index === 0) {
    return 0;
  }

  index -= 1;
  while (index >= 0 && isWhitespace(value[index])) {
    index -= 1;
  }

  if (index < 0) {
    return 0;
  }

  if (bigWord) {
    while (index > 0 && !isWhitespace(value[index - 1])) {
      index -= 1;
    }
    return index;
  }

  if (isWordChar(value[index])) {
    while (index > 0 && isWordChar(value[index - 1])) {
      index -= 1;
    }
    return index;
  }

  while (
    index > 0 &&
    !isWhitespace(value[index - 1]) &&
    !isWordChar(value[index - 1])
  ) {
    index -= 1;
  }
  return index;
};

const moveWordForwardEnd = (value: string, offset: number, bigWord: boolean) => {
  if (value.length === 0) {
    return 0;
  }

  const safeOffset = clamp(offset, 0, value.length - 1);
  let index = safeOffset;

  const classify = (char: string | undefined) => {
    if (isWhitespace(char)) {
      return "space";
    }
    if (bigWord || isWordChar(char)) {
      return "word";
    }
    return "punctuation";
  };

  const moveToClassEnd = (start: number) => {
    let cursor = start;
    const charClass = classify(value[cursor]);
    while (cursor + 1 < value.length && classify(value[cursor + 1]) === charClass) {
      cursor += 1;
    }
    return cursor;
  };

  if (classify(value[index]) !== "space") {
    const currentClass = classify(value[index]);
    if (index + 1 < value.length && classify(value[index + 1]) === currentClass) {
      return moveToClassEnd(index);
    }
    index += 1;
  }

  while (index < value.length && classify(value[index]) === "space") {
    index += 1;
  }

  if (index >= value.length) {
    return safeOffset;
  }

  return moveToClassEnd(index);
};

const normalizeRange = (start: number, end: number): [number, number] =>
  start <= end ? [start, end] : [end, start];

const splitClipboardLines = (text: string) => {
  const lines = text.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length ? lines : [""];
};

export const createCodeBlockVimController = (
  options: CreateCodeBlockVimControllerOptions,
): CodeBlockVimController => {
  const {
    editable,
    initialMode,
    onSubmit,
    onTextChange,
    onModeChange,
    onSelectionChange,
    readClipboardText,
    writeClipboardText,
  } = options;

  let mode = initialMode;
  let pendingOperator: PendingOperator | null = null;
  let pendingCharMotion: PendingCharMotion | null = null;
  let preferredColumn: number | null = null;

  let visualAnchor: number | null = null;
  let visualHead: number | null = null;

  let blockAnchor: LineColumn | null = null;
  let blockHead: LineColumn | null = null;

  const emitSelectionChange = () => {
    onSelectionChange?.(editable.selectionStart, editable.selectionEnd);
  };

  const syncTextareaForMode = () => {
    editable.readOnly = false;
    editable.dataset.vimMode = mode;
    onModeChange?.(mode);
    emitSelectionChange();
  };

  const getCurrentOffset = () => {
    if (mode === "visual" && visualHead !== null) {
      return visualHead;
    }
    if (mode === "visualBlock" && blockHead) {
      return getOffsetFromLineColumn(editable.value, blockHead);
    }

    const safeOffset = clamp(editable.selectionStart ?? 0, 0, editable.value.length);
    if (mode !== "normal") {
      return safeOffset;
    }

    const value = editable.value;
    const { lineStart, lineEnd } = getCurrentLineRange(value, safeOffset);
    if (lineEnd > lineStart && safeOffset >= lineEnd) {
      return lineEnd - 1;
    }

    return safeOffset;
  };

  const setCaret = (offset: number) => {
    const safeOffset = clamp(offset, 0, editable.value.length);
    editable.setSelectionRange(safeOffset, safeOffset);
    emitSelectionChange();
  };

  const setVisualSelection = (anchor: number, head: number) => {
    const [start, end] = normalizeRange(anchor, head);
    editable.setSelectionRange(start, end, anchor <= head ? "forward" : "backward");
    emitSelectionChange();
  };

  const normalizeMotionKey = (key: string) => {
    if (key === "ArrowLeft") {
      return "h";
    }
    if (key === "ArrowDown") {
      return "j";
    }
    if (key === "ArrowUp") {
      return "k";
    }
    if (key === "ArrowRight") {
      return "l";
    }
    return key;
  };

  const getFirstNonWhitespaceOffsetInLine = (offset: number) => {
    const value = editable.value;
    const range = getCurrentLineRange(value, offset);
    let index = range.lineStart;
    while (index < range.lineEnd && isWhitespace(value[index])) {
      index += 1;
    }
    return index;
  };

  const clearPending = () => {
    pendingOperator = null;
    pendingCharMotion = null;
  };

  const enterNormalMode = (offset: number) => {
    mode = "normal";
    visualAnchor = null;
    visualHead = null;
    blockAnchor = null;
    blockHead = null;
    clearPending();
    setCaret(offset);
    syncTextareaForMode();
  };

  const enterInsertMode = (offset: number) => {
    mode = "insert";
    visualAnchor = null;
    visualHead = null;
    blockAnchor = null;
    blockHead = null;
    clearPending();
    setCaret(offset);
    syncTextareaForMode();
  };

  const enterVisualMode = (offset: number) => {
    mode = "visual";
    clearPending();
    visualAnchor = offset;
    visualHead = offset;
    setVisualSelection(offset, offset);
    syncTextareaForMode();
  };

  const enterVisualBlockMode = (lineColumn: LineColumn) => {
    mode = "visualBlock";
    clearPending();
    blockAnchor = lineColumn;
    blockHead = lineColumn;
    setCaret(getOffsetFromLineColumn(editable.value, lineColumn));
    syncTextareaForMode();
  };

  const preventAndStop = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const applyValueAndCaret = (nextValue: string, nextOffset: number) => {
    const safeOffset = clamp(nextOffset, 0, nextValue.length);
    const didChange = editable.value !== nextValue;
    if (didChange) {
      editable.value = nextValue;
      onTextChange();
    }
    setCaret(safeOffset);
  };

  const moveOffsetByKey = (key: string, offset: number): number | null => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const lineRange = getCurrentLineRange(value, safeOffset);
    const maxOffsetOnLine =
      lineRange.lineEnd > lineRange.lineStart
        ? lineRange.lineEnd - 1
        : lineRange.lineStart;
    const normalizedOffset = clamp(
      safeOffset,
      lineRange.lineStart,
      maxOffsetOnLine,
    );

    if (key === "h") {
      preferredColumn = null;
      return Math.max(lineRange.lineStart, normalizedOffset - 1);
    }
    if (key === "l") {
      preferredColumn = null;
      return Math.min(maxOffsetOnLine, normalizedOffset + 1);
    }
    if (key === "w") {
      preferredColumn = null;
      return moveWordForwardStart(value, safeOffset, false);
    }
    if (key === "W") {
      preferredColumn = null;
      return moveWordForwardStart(value, safeOffset, true);
    }
    if (key === "b") {
      preferredColumn = null;
      return moveWordBackwardStart(value, safeOffset, false);
    }
    if (key === "B") {
      preferredColumn = null;
      return moveWordBackwardStart(value, safeOffset, true);
    }
    if (key === "e") {
      preferredColumn = null;
      return moveWordForwardEnd(value, safeOffset, false);
    }
    if (key === "E") {
      preferredColumn = null;
      return moveWordForwardEnd(value, safeOffset, true);
    }

    if (key === "j" || key === "k") {
      const current = getLineColumnFromOffset(value, safeOffset);
      const targetColumn = preferredColumn ?? current.column;
      const direction = key === "j" ? 1 : -1;
      const lineStarts = getLineStarts(value);
      const targetLine = clamp(current.line + direction, 0, lineStarts.length - 1);
      preferredColumn = targetColumn;
      return getOffsetFromLineColumn(value, {
        line: targetLine,
        column: targetColumn,
      });
    }

    return null;
  };

  const resolveCharMotionDestination = (
    offset: number,
    motion: CharMotion,
    targetChar: string,
  ): number | null => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const { lineStart, lineEnd } = getCurrentLineRange(value, safeOffset);

    if (motion === "f" || motion === "t") {
      for (let i = safeOffset + 1; i < lineEnd; i++) {
        if (value[i] === targetChar) {
          if (motion === "f") {
            return i;
          }
          return Math.max(lineStart, i - 1);
        }
      }
      return null;
    }

    for (let i = safeOffset - 1; i >= lineStart; i--) {
      if (value[i] === targetChar) {
        if (motion === "F") {
          return i;
        }
        return Math.min(lineEnd, i + 1);
      }
    }

    return null;
  };

  const yankRange = async (start: number, end: number) => {
    const [rangeStart, rangeEnd] = normalizeRange(start, end);
    const text = editable.value.slice(rangeStart, rangeEnd);
    await writeClipboardText(text);
  };

  const yankLineAtOffset = async (offset: number) => {
    const range = getCurrentLineRange(editable.value, offset);
    const lineText = editable.value.slice(range.lineStart, range.lineEndWithBreak);
    await writeClipboardText(
      lineText.endsWith("\n") ? lineText : `${lineText}\n`,
    );
  };

  const writeClipboardBestEffort = (text: string) => {
    if (!text) {
      return;
    }
    void writeClipboardText(text).catch(() => {});
  };

  const getLinewiseRangeForVerticalMotion = (
    offset: number,
    key: "j" | "k",
  ): [number, number] => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const startLine = getCurrentLineRange(value, safeOffset);
    const currentLine = getLineColumnFromOffset(value, safeOffset).line;
    const targetLine = clamp(
      currentLine + (key === "j" ? 1 : -1),
      0,
      getLineStarts(value).length - 1,
    );
    const targetLineOffset = getOffsetFromLineColumn(value, {
      line: targetLine,
      column: 0,
    });
    const targetRange = getCurrentLineRange(value, targetLineOffset);
    return [
      Math.min(startLine.lineStart, targetRange.lineStart),
      Math.max(startLine.lineEndWithBreak, targetRange.lineEndWithBreak),
    ];
  };

  const getRangeForOperatorMotion = (
    offset: number,
    key: string,
  ): [number, number] | null => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);

    if (key === "j" || key === "k") {
      return getLinewiseRangeForVerticalMotion(safeOffset, key);
    }

    const nextOffset = moveOffsetByKey(key, safeOffset);
    if (nextOffset === null) {
      return null;
    }

    if (key === "e" || key === "E") {
      const rangeEnd = nextOffset >= safeOffset ? nextOffset + 1 : nextOffset;
      return normalizeRange(safeOffset, rangeEnd);
    }

    return normalizeRange(safeOffset, nextOffset);
  };

  const getDeleteLineRangeAtOffset = (offset: number): [number, number] => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const line = getCurrentLineRange(value, safeOffset);

    if (
      line.lineEndWithBreak === value.length &&
      line.lineStart > 0 &&
      value.length > 0 &&
      value[value.length - 1] !== "\n"
    ) {
      return [line.lineStart - 1, line.lineEndWithBreak];
    }

    return [line.lineStart, line.lineEndWithBreak];
  };

  const deleteRange = (start: number, end: number) => {
    const value = editable.value;
    const [rangeStart, rangeEnd] = normalizeRange(
      clamp(start, 0, value.length),
      clamp(end, 0, value.length),
    );
    const deletedText = value.slice(rangeStart, rangeEnd);
    const nextValue = value.slice(0, rangeStart) + value.slice(rangeEnd);
    applyValueAndCaret(nextValue, rangeStart);
    writeClipboardBestEffort(deletedText);
    return rangeStart;
  };

  const deleteLineAtOffset = (offset: number) => {
    const [lineStart, lineEnd] = getDeleteLineRangeAtOffset(offset);
    return deleteRange(lineStart, lineEnd);
  };

  const changeRange = (start: number, end: number) => {
    const nextOffset = deleteRange(start, end);
    enterInsertMode(nextOffset);
    return nextOffset;
  };

  const changeLineAtOffset = (offset: number) => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const line = getCurrentLineRange(value, safeOffset);
    return changeRange(line.lineStart, line.lineEnd);
  };

  const deleteToEndOfLineAtOffset = (offset: number) => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const line = getCurrentLineRange(value, safeOffset);
    const lineOffset = clamp(safeOffset, line.lineStart, line.lineEnd);
    return deleteRange(lineOffset, line.lineEnd);
  };

  const changeToEndOfLineAtOffset = (offset: number) => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);
    const line = getCurrentLineRange(value, safeOffset);
    const lineOffset = clamp(safeOffset, line.lineStart, line.lineEnd);
    return changeRange(lineOffset, line.lineEnd);
  };

  const substituteAtOffset = (offset: number) => {
    const value = editable.value;
    const safeOffset = clamp(offset, 0, value.length);

    if (value.length === 0) {
      enterInsertMode(0);
      return;
    }

    const line = getCurrentLineRange(value, safeOffset);
    if (line.lineEnd <= line.lineStart) {
      enterInsertMode(line.lineStart);
      return;
    }

    const targetOffset = clamp(safeOffset, line.lineStart, line.lineEnd - 1);
    changeRange(targetOffset, targetOffset + 1);
  };

  const substituteLineAtOffset = (offset: number) => {
    changeLineAtOffset(offset);
  };

  const openLineAboveAtOffset = (offset: number) => {
    const value = editable.value;
    const line = getCurrentLineRange(value, clamp(offset, 0, value.length));
    const insertAt = line.lineStart;
    const nextValue = value.slice(0, insertAt) + "\n" + value.slice(insertAt);
    applyValueAndCaret(nextValue, insertAt);
    enterInsertMode(insertAt);
  };

  const openLineBelowAtOffset = (offset: number) => {
    const value = editable.value;
    const line = getCurrentLineRange(value, clamp(offset, 0, value.length));
    const insertAt = line.lineEndWithBreak;
    const nextValue = value.slice(0, insertAt) + "\n" + value.slice(insertAt);
    const isEndWithoutTrailingBreak =
      line.lineEndWithBreak === value.length &&
      (value.length === 0 || value[value.length - 1] !== "\n");
    const caretOffset = isEndWithoutTrailingBreak ? insertAt + 1 : insertAt;
    applyValueAndCaret(nextValue, caretOffset);
    enterInsertMode(caretOffset);
  };

  const readClipboard = async () => {
    try {
      return await readClipboardText();
    } catch {
      return null;
    }
  };

  const pasteInNormalMode = async () => {
    const clipboardText = await readClipboard();
    if (!clipboardText) {
      return;
    }

    const value = editable.value;
    const offset = getCurrentOffset();

    if (clipboardText.endsWith("\n")) {
      const line = getCurrentLineRange(value, offset);
      const needsLeadingLineBreak =
        line.lineEndWithBreak === value.length &&
        value.length > 0 &&
        value[value.length - 1] !== "\n";
      const insertion = needsLeadingLineBreak
        ? `\n${clipboardText}`
        : clipboardText;
      const nextValue =
        value.slice(0, line.lineEndWithBreak) +
        insertion +
        value.slice(line.lineEndWithBreak);
      applyValueAndCaret(nextValue, line.lineEndWithBreak + insertion.length);
      return;
    }

    const insertAt = clamp(offset + 1, 0, value.length);
    const nextValue =
      value.slice(0, insertAt) + clipboardText + value.slice(insertAt);
    applyValueAndCaret(nextValue, insertAt + clipboardText.length);
  };

  const getVisualRange = (): [number, number] | null => {
    if (visualAnchor === null || visualHead === null) {
      return null;
    }
    return normalizeRange(visualAnchor, visualHead);
  };

  const swapVisualSelectionEnds = () => {
    if (visualAnchor === null || visualHead === null) {
      return;
    }
    const nextAnchor = visualHead;
    const nextHead = visualAnchor;
    visualAnchor = nextAnchor;
    visualHead = nextHead;
    setVisualSelection(visualAnchor, visualHead);
  };

  const deleteVisualSelection = () => {
    const range = getVisualRange();
    if (!range) {
      return null;
    }
    return deleteRange(range[0], range[1]);
  };

  const changeVisualSelection = () => {
    const range = getVisualRange();
    if (!range) {
      enterInsertMode(getCurrentOffset());
      return;
    }
    changeRange(range[0], range[1]);
  };

  const yankVisualSelection = async () => {
    const range = getVisualRange();
    if (!range) {
      return;
    }
    await yankRange(range[0], range[1]);
  };

  const pasteOverVisualSelection = async (): Promise<number | null> => {
    const clipboardText = await readClipboard();
    if (clipboardText === null) {
      return null;
    }
    const range = getVisualRange();
    if (!range) {
      return null;
    }

    const nextValue =
      editable.value.slice(0, range[0]) +
      clipboardText +
      editable.value.slice(range[1]);
    const nextOffset = range[0] + clipboardText.length;
    applyValueAndCaret(nextValue, nextOffset);
    return nextOffset;
  };

  const getVisualBlockSelection = () => {
    if (!blockAnchor || !blockHead) {
      return null;
    }

    const startLine = Math.min(blockAnchor.line, blockHead.line);
    const endLine = Math.max(blockAnchor.line, blockHead.line);
    const startColumn = Math.min(blockAnchor.column, blockHead.column);
    const endColumn = Math.max(blockAnchor.column, blockHead.column);

    return {
      startLine,
      endLine,
      startColumn,
      endColumn,
    };
  };

  const yankVisualBlockSelection = async () => {
    const block = getVisualBlockSelection();
    if (!block) {
      return;
    }

    const value = editable.value;
    const lines: string[] = [];

    for (let line = block.startLine; line <= block.endLine; line++) {
      const start = getOffsetFromLineColumn(value, {
        line,
        column: block.startColumn,
      });
      const end = getOffsetFromLineColumn(value, {
        line,
        column: block.endColumn + 1,
      });
      lines.push(value.slice(start, end));
    }

    await writeClipboardText(lines.join("\n"));
  };

  const pasteIntoVisualBlockSelection = async (): Promise<number | null> => {
    const block = getVisualBlockSelection();
    if (!block) {
      return null;
    }

    const clipboardText = await readClipboard();
    if (clipboardText === null) {
      return null;
    }

    const chunks = splitClipboardLines(clipboardText);
    let nextValue = editable.value;

    for (let line = block.endLine; line >= block.startLine; line--) {
      const chunkIndex = line - block.startLine;
      const chunk = chunks[Math.min(chunkIndex, chunks.length - 1)] ?? "";
      const insertAt = getOffsetFromLineColumn(nextValue, {
        line,
        column: block.startColumn,
      });
      nextValue =
        nextValue.slice(0, insertAt) + chunk + nextValue.slice(insertAt);
    }

    const lastChunk =
      chunks[Math.min(block.endLine - block.startLine, chunks.length - 1)] ?? "";
    const caretOffset = getOffsetFromLineColumn(nextValue, {
      line: block.endLine,
      column: block.startColumn + lastChunk.length,
    });

    applyValueAndCaret(nextValue, caretOffset);
    return caretOffset;
  };

  const moveVisualHeadWithMotion = (nextOffset: number) => {
    if (visualAnchor === null) {
      return;
    }
    visualHead = nextOffset;
    setVisualSelection(visualAnchor, visualHead);
  };

  const moveBlockHeadByKey = (key: string) => {
    if (!blockHead) {
      return;
    }
    const value = editable.value;
    const lineStarts = getLineStarts(value);

    let nextLine = blockHead.line;
    let nextColumn = blockHead.column;

    if (key === "h") {
      nextColumn = Math.max(0, nextColumn - 1);
    } else if (key === "l") {
      nextColumn += 1;
    } else if (key === "j") {
      nextLine = clamp(nextLine + 1, 0, lineStarts.length - 1);
    } else if (key === "k") {
      nextLine = clamp(nextLine - 1, 0, lineStarts.length - 1);
    }

    const lineStart = lineStarts[nextLine] ?? 0;
    const lineEnd = getLineEndOffset(value, lineStart);
    const clampedColumn = clamp(nextColumn, 0, lineEnd - lineStart);
    blockHead = {
      line: nextLine,
      column: clampedColumn,
    };
    setCaret(getOffsetFromLineColumn(value, blockHead));
  };

  const yankForMotion = async (start: number, key: string) => {
    const safeStart = clamp(start, 0, editable.value.length);

    if (key === "y") {
      await yankLineAtOffset(safeStart);
      return;
    }

    const range = getRangeForOperatorMotion(safeStart, key);
    if (!range) {
      return;
    }

    await yankRange(range[0], range[1]);
  };

  const deleteForMotion = (start: number, key: string) => {
    const safeStart = clamp(start, 0, editable.value.length);

    if (key === "d") {
      deleteLineAtOffset(safeStart);
      return;
    }

    const range = getRangeForOperatorMotion(safeStart, key);
    if (!range) {
      return;
    }

    deleteRange(range[0], range[1]);
  };

  const changeForMotion = (start: number, key: string) => {
    const safeStart = clamp(start, 0, editable.value.length);

    if (key === "c") {
      changeLineAtOffset(safeStart);
      return;
    }

    const range = getRangeForOperatorMotion(safeStart, key);
    if (!range) {
      return;
    }

    changeRange(range[0], range[1]);
  };

  const handlePendingCharMotion = (event: KeyboardEvent) => {
    if (!pendingCharMotion) {
      return false;
    }

    if (event.key === "Escape") {
      preventAndStop(event);
      clearPending();
      return true;
    }

    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
      preventAndStop(event);
      clearPending();
      return true;
    }

    preventAndStop(event);

    const startOffset =
      pendingCharMotion.operatorStart !== null
        ? pendingCharMotion.operatorStart
        : getCurrentOffset();
    const target = resolveCharMotionDestination(
      startOffset,
      pendingCharMotion.motion,
      event.key,
    );

    if (target !== null) {
      if (pendingCharMotion.operatorStart !== null) {
        const adjustment =
          pendingCharMotion.motion === "f" || pendingCharMotion.motion === "F"
            ? target + (target >= startOffset ? 1 : 0)
            : target;
        if (pendingCharMotion.operator === "y") {
          void yankRange(startOffset, adjustment);
        } else if (pendingCharMotion.operator === "d") {
          deleteRange(startOffset, adjustment);
        } else if (pendingCharMotion.operator === "c") {
          changeRange(startOffset, adjustment);
        }
      } else if (mode === "visual") {
        moveVisualHeadWithMotion(target);
      } else {
        setCaret(target);
      }
    }

    clearPending();
    return true;
  };

  const handleNormalMode = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) {
      return false;
    }

    if (pendingCharMotion) {
      return handlePendingCharMotion(event);
    }

    if (event.key === "Escape") {
      preventAndStop(event);
      if (pendingOperator || pendingCharMotion) {
        clearPending();
      } else {
        onSubmit();
      }
      return true;
    }

    if (event.metaKey || event.altKey) {
      return false;
    }

    const key = event.key;
    const motionKey = normalizeMotionKey(key);

    if (event.ctrlKey && key.toLowerCase() !== "v") {
      return false;
    }

    if (event.ctrlKey && key.toLowerCase() === "v") {
      preventAndStop(event);
      enterVisualBlockMode(getLineColumnFromOffset(editable.value, getCurrentOffset()));
      return true;
    }

    if (pendingOperator) {
      preventAndStop(event);

      if (key === "f" || key === "F" || key === "t" || key === "T") {
        pendingCharMotion = {
          motion: key,
          operatorStart: getCurrentOffset(),
          operator: pendingOperator,
        };
        return true;
      }

      const startOffset = getCurrentOffset();
      const nextMotionKey = normalizeMotionKey(key);
      if (pendingOperator === "y") {
        void yankForMotion(startOffset, nextMotionKey);
      } else if (pendingOperator === "d") {
        deleteForMotion(startOffset, nextMotionKey);
      } else if (pendingOperator === "c") {
        changeForMotion(startOffset, nextMotionKey);
      }
      clearPending();
      return true;
    }

    if (key === "i") {
      preventAndStop(event);
      enterInsertMode(getCurrentOffset());
      return true;
    }

    if (key === "a") {
      preventAndStop(event);
      enterInsertMode(Math.min(getCurrentOffset() + 1, editable.value.length));
      return true;
    }

    if (key === "A") {
      preventAndStop(event);
      const line = getCurrentLineRange(editable.value, getCurrentOffset());
      enterInsertMode(line.lineEnd);
      return true;
    }

    if (key === "I") {
      preventAndStop(event);
      enterInsertMode(getFirstNonWhitespaceOffsetInLine(getCurrentOffset()));
      return true;
    }

    if (key === "o") {
      preventAndStop(event);
      openLineBelowAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "O") {
      preventAndStop(event);
      openLineAboveAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "v") {
      preventAndStop(event);
      enterVisualMode(getCurrentOffset());
      return true;
    }

    if (key === "y") {
      preventAndStop(event);
      pendingOperator = "y";
      return true;
    }

    if (key === "d") {
      preventAndStop(event);
      pendingOperator = "d";
      return true;
    }

    if (key === "c") {
      preventAndStop(event);
      pendingOperator = "c";
      return true;
    }

    if (key === "D") {
      preventAndStop(event);
      deleteToEndOfLineAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "C") {
      preventAndStop(event);
      changeToEndOfLineAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "s") {
      preventAndStop(event);
      substituteAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "S") {
      preventAndStop(event);
      substituteLineAtOffset(getCurrentOffset());
      return true;
    }

    if (key === "p") {
      preventAndStop(event);
      void pasteInNormalMode();
      return true;
    }

    if (key === "f" || key === "F" || key === "t" || key === "T") {
      preventAndStop(event);
      pendingCharMotion = {
        motion: key,
        operatorStart: null,
        operator: null,
      };
      return true;
    }

    const nextOffset = moveOffsetByKey(motionKey, getCurrentOffset());
    if (nextOffset !== null) {
      preventAndStop(event);
      setCaret(nextOffset);
      return true;
    }

    if (isPrintableKey(event)) {
      preventAndStop(event);
      return true;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      preventAndStop(event);
      return true;
    }

    return false;
  };

  const handleVisualMode = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) {
      return false;
    }

    if (pendingCharMotion) {
      return handlePendingCharMotion(event);
    }

    const key = event.key;
    const motionKey = normalizeMotionKey(key);

    if (key === "Escape") {
      preventAndStop(event);
      const offset = visualHead ?? getCurrentOffset();
      enterNormalMode(offset);
      return true;
    }

    if (event.metaKey || event.altKey) {
      return false;
    }

    if (event.ctrlKey && key.toLowerCase() !== "v") {
      return false;
    }

    if (event.ctrlKey && key.toLowerCase() === "v") {
      preventAndStop(event);
      const anchorOffset = visualAnchor ?? getCurrentOffset();
      const headOffset = visualHead ?? getCurrentOffset();
      blockAnchor = getLineColumnFromOffset(editable.value, anchorOffset);
      blockHead = getLineColumnFromOffset(editable.value, headOffset);
      mode = "visualBlock";
      clearPending();
      setCaret(getOffsetFromLineColumn(editable.value, blockHead));
      syncTextareaForMode();
      return true;
    }

    if (key === "v") {
      preventAndStop(event);
      enterNormalMode(visualHead ?? getCurrentOffset());
      return true;
    }

    if (key === "o" || key === "O") {
      preventAndStop(event);
      swapVisualSelectionEnds();
      return true;
    }

    if (key === "y") {
      preventAndStop(event);
      void yankVisualSelection();
      enterNormalMode(visualHead ?? getCurrentOffset());
      return true;
    }

    if (key === "d" || key === "D") {
      preventAndStop(event);
      const nextOffset = deleteVisualSelection();
      enterNormalMode(nextOffset ?? getCurrentOffset());
      return true;
    }

    if (key === "c" || key === "C" || key === "s" || key === "S") {
      preventAndStop(event);
      changeVisualSelection();
      return true;
    }

    if (key === "p") {
      preventAndStop(event);
      void pasteOverVisualSelection().then((nextOffset) => {
        enterNormalMode(nextOffset ?? getCurrentOffset());
      });
      return true;
    }

    if (key === "f" || key === "F" || key === "t" || key === "T") {
      preventAndStop(event);
      pendingCharMotion = {
        motion: key,
        operatorStart: null,
        operator: null,
      };
      return true;
    }

    const nextOffset = moveOffsetByKey(
      motionKey,
      visualHead ?? getCurrentOffset(),
    );
    if (nextOffset !== null) {
      preventAndStop(event);
      moveVisualHeadWithMotion(nextOffset);
      return true;
    }

    if (isPrintableKey(event)) {
      preventAndStop(event);
      return true;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      preventAndStop(event);
      return true;
    }

    return false;
  };

  const handleVisualBlockMode = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) {
      return false;
    }

    const key = event.key;
    const motionKey = normalizeMotionKey(key);

    if (key === "Escape") {
      preventAndStop(event);
      enterNormalMode(getCurrentOffset());
      return true;
    }

    if (event.metaKey || event.altKey) {
      return false;
    }

    if (event.ctrlKey && key.toLowerCase() !== "v") {
      return false;
    }

    if (event.ctrlKey && key.toLowerCase() === "v") {
      preventAndStop(event);
      enterNormalMode(getCurrentOffset());
      return true;
    }

    if (key === "y") {
      preventAndStop(event);
      void yankVisualBlockSelection();
      enterNormalMode(getCurrentOffset());
      return true;
    }

    if (key === "p") {
      preventAndStop(event);
      void pasteIntoVisualBlockSelection().then((nextOffset) => {
        enterNormalMode(nextOffset ?? getCurrentOffset());
      });
      return true;
    }

    if (
      motionKey === "h" ||
      motionKey === "j" ||
      motionKey === "k" ||
      motionKey === "l"
    ) {
      preventAndStop(event);
      moveBlockHeadByKey(motionKey);
      return true;
    }

    if (isPrintableKey(event)) {
      preventAndStop(event);
      return true;
    }

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      preventAndStop(event);
      return true;
    }

    return false;
  };

  syncTextareaForMode();

  return {
    handleKeyDown: (event) => {
      if (mode === "insert") {
        if (event.key === "Escape") {
          preventAndStop(event);
          enterNormalMode(getCurrentOffset());
          return true;
        }
        return false;
      }

      if (mode === "normal") {
        return handleNormalMode(event);
      }

      if (mode === "visual") {
        return handleVisualMode(event);
      }

      return handleVisualBlockMode(event);
    },
    getMode: () => mode,
    destroy: () => {
      delete editable.dataset.vimMode;
      editable.readOnly = false;
    },
  };
};
