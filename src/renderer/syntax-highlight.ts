import type { TextSegment } from "./types.js";
import { COLORS, ANSI_COLORS } from "./theme.js";

const HIGHLIGHT_COLORS = {
  keyword: "rgb(175, 135, 255)",
  string: COLORS.success,
  comment: ANSI_COLORS[90],
  number: COLORS.warning,
  type: ANSI_COLORS[36],
  plain: COLORS.text,
};

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "this", "class",
  "extends", "import", "export", "from", "default", "async", "await",
  "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of",
  "true", "false", "null", "undefined", "void", "yield", "interface", "type",
  "enum", "implements", "private", "public", "protected", "static", "readonly",
  "abstract", "as", "is", "keyof", "never", "unknown",
]);

const PY_KEYWORDS = new Set([
  "def", "class", "return", "if", "elif", "else", "for", "while", "import",
  "from", "as", "try", "except", "finally", "raise", "with", "yield",
  "lambda", "pass", "break", "continue", "and", "or", "not", "in", "is",
  "True", "False", "None", "self", "async", "await", "global", "nonlocal",
]);

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
  "esac", "function", "return", "exit", "echo", "export", "source", "local",
  "readonly", "set", "unset", "cd", "pwd", "mkdir", "rm", "cp", "mv", "cat",
  "grep", "sed", "awk", "find", "xargs", "true", "false",
]);

const PY_FAMILY = new Set(["python", "py"]);
const BASH_FAMILY = new Set(["bash", "sh", "shell", "zsh"]);
const HASH_COMMENT_LANGS = new Set([...PY_FAMILY, ...BASH_FAMILY, "yaml", "yml", "toml"]);

function getKeywords(lang?: string): Set<string> {
  if (!lang) return JS_KEYWORDS;
  const l = lang.toLowerCase();
  if (PY_FAMILY.has(l)) return PY_KEYWORDS;
  if (BASH_FAMILY.has(l)) return BASH_KEYWORDS;
  return JS_KEYWORDS;
}

function isCommentStart(line: string, i: number, lang?: string): boolean {
  if (line[i] === "/" && line[i + 1] === "/") return true;
  if (line[i] === "#" && lang && HASH_COMMENT_LANGS.has(lang.toLowerCase())) return true;
  return false;
}

export function highlightCode(line: string, lang?: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const keywords = getKeywords(lang);
  let i = 0;
  let plain = "";

  const flush = () => {
    if (plain) {
      segments.push({ text: plain, color: HIGHLIGHT_COLORS.plain });
      plain = "";
    }
  };

  while (i < line.length) {
    // Comments
    if (isCommentStart(line, i, lang)) {
      flush();
      segments.push({ text: line.slice(i), color: HIGHLIGHT_COLORS.comment });
      return segments;
    }

    // Strings
    if (line[i] === '"' || line[i] === "'" || line[i] === "`") {
      const quote = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === "\\") j++;
        j++;
      }
      if (j < line.length) j++;
      flush();
      segments.push({ text: line.slice(i, j), color: HIGHLIGHT_COLORS.string });
      i = j;
      continue;
    }

    // Numbers
    if (/[0-9]/.test(line[i]) && (i === 0 || /[\s,(\[{=:+\-*/<>!&|^~%]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.xXa-fA-F_]/.test(line[j])) j++;
      flush();
      segments.push({ text: line.slice(i, j), color: HIGHLIGHT_COLORS.number });
      i = j;
      continue;
    }

    // Words (identifiers/keywords/types)
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);

      if (keywords.has(word)) {
        flush();
        segments.push({ text: word, color: HIGHLIGHT_COLORS.keyword });
      } else if (/^[A-Z][a-zA-Z]+$/.test(word)) {
        flush();
        segments.push({ text: word, color: HIGHLIGHT_COLORS.type });
      } else {
        plain += word;
      }
      i = j;
      continue;
    }

    plain += line[i];
    i++;
  }

  flush();
  if (segments.length === 0) {
    segments.push({ text: line || " ", color: HIGHLIGHT_COLORS.plain });
  }
  return segments;
}
