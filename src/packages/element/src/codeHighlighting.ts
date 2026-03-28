import type { Theme } from "./types";

export type CodeTokenType =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function";

export type CodeToken = {
  text: string;
  type: CodeTokenType;
};

export type CodeTokenPalette = Record<CodeTokenType, string>;

const PYTHON_KEYWORDS = new Set([
  "and",
  "as",
  "assert",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "False",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "None",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "True",
  "try",
  "while",
  "with",
  "yield",
]);

const isWordStart = (char: string) => /[A-Za-z_]/.test(char);
const isWord = (char: string) => /[A-Za-z0-9_]/.test(char);
const isNumber = (char: string) => /[0-9]/.test(char);

const pushToken = (tokens: CodeToken[], token: CodeToken) => {
  const previous = tokens[tokens.length - 1];
  if (previous && previous.type === token.type) {
    previous.text += token.text;
    return;
  }
  tokens.push(token);
};

export const tokenizeCodeLine = (line: string): CodeToken[] => {
  const tokens: CodeToken[] = [];

  let index = 0;
  while (index < line.length) {
    const char = line[index];

    if (char === "#") {
      pushToken(tokens, {
        text: line.slice(index),
        type: "comment",
      });
      break;
    }

    if (char === "\"" || char === "'") {
      const quote = char;
      const start = index;
      index += 1;

      while (index < line.length) {
        if (line[index] === "\\") {
          index += 2;
          continue;
        }
        if (line[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }

      pushToken(tokens, {
        text: line.slice(start, index),
        type: "string",
      });
      continue;
    }

    if (isNumber(char)) {
      const start = index;
      index += 1;

      while (index < line.length && /[0-9_]/.test(line[index])) {
        index += 1;
      }
      if (
        line[index] === "." &&
        index + 1 < line.length &&
        isNumber(line[index + 1])
      ) {
        index += 1;
        while (index < line.length && /[0-9_]/.test(line[index])) {
          index += 1;
        }
      }

      pushToken(tokens, {
        text: line.slice(start, index),
        type: "number",
      });
      continue;
    }

    if (isWordStart(char)) {
      const start = index;
      index += 1;
      while (index < line.length && isWord(line[index])) {
        index += 1;
      }

      const word = line.slice(start, index);
      if (PYTHON_KEYWORDS.has(word)) {
        pushToken(tokens, { text: word, type: "keyword" });
        continue;
      }

      let nextIndex = index;
      while (nextIndex < line.length && /\s/.test(line[nextIndex])) {
        nextIndex += 1;
      }

      const type: CodeTokenType = line[nextIndex] === "(" ? "function" : "plain";
      pushToken(tokens, { text: word, type });
      continue;
    }

    pushToken(tokens, { text: char, type: "plain" });
    index += 1;
  }

  return tokens;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const getCodeTokenPalette = (
  theme: Theme,
  fallbackColor: string,
): CodeTokenPalette => {
  if (theme === "dark") {
    return {
      plain: fallbackColor,
      keyword: "#6cb4ff",
      string: "#86d68f",
      comment: "#8d98a5",
      number: "#f5be76",
      function: "#d7a9ff",
    };
  }

  return {
    plain: fallbackColor,
    keyword: "#005cc5",
    string: "#1a7f37",
    comment: "#6e7781",
    number: "#b35900",
    function: "#7c3aed",
  };
};

export const highlightCodeAsHtml = (
  code: string,
  palette: CodeTokenPalette,
) => {
  return code
    .split("\n")
    .map((line) =>
      tokenizeCodeLine(line)
        .map((token) => {
          const text = escapeHtml(token.text);
          return `<span style="color:${palette[token.type]}">${text}</span>`;
        })
        .join(""),
    )
    .join("\n");
};
