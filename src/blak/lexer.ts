import { BlakError, KEYWORDS } from "./types";
import type { Token, TokenType } from "./types";

const KEYWORD_SET: Set<string> = new Set(KEYWORDS);

const TWO_CHAR_OPS = ["==", "!=", ">=", "<=", "&&", "||"];
const ONE_CHAR_OPS = ["=", ">", "<", "+", "-", "*", "/", "%", "!"];
const PUNCT = ["{", "}", "(", ")", "[", "]", ",", ".", ":"];

const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isIdentStart = (ch: string) => /[A-Za-z_]/.test(ch);
const isIdentPart = (ch: string) => /[A-Za-z0-9_]/.test(ch);

/**
 * BLAK has no semicolons: newlines end statements, so they are real tokens.
 * Runs of blank lines collapse into a single newline token to keep the parser
 * simple.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const push = (type: TokenType, value: string, at: number) => {
    tokens.push({ type, value, line, column: at - lineStart + 1 });
  };

  const lastMeaningful = () => {
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (tokens[k].type !== "newline") return tokens[k];
    }
    return null;
  };

  while (i < source.length) {
    const ch = source[i];

    // line comments: # … and // …
    if (ch === "#" || (ch === "/" && source[i + 1] === "/")) {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    if (ch === "\n") {
      // Collapse consecutive newlines, and never start the stream with one.
      if (tokens.length > 0 && tokens[tokens.length - 1].type !== "newline") {
        push("newline", "\\n", i);
      }
      i++;
      line++;
      lineStart = i;
      continue;
    }

    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      let value = "";
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          const next = source[i + 1];
          if (next === "n") value += "\n";
          else if (next === "t") value += "\t";
          else if (next === "\\") value += "\\";
          else if (next === quote) value += quote;
          else value += next ?? "";
          i += 2;
          continue;
        }
        if (source[i] === "\n") {
          throw new BlakError("A text value is missing its closing quote", line);
        }
        value += source[i];
        i++;
      }
      if (i >= source.length) {
        throw new BlakError("A text value is missing its closing quote", line);
      }
      i++; // closing quote
      push("string", value, start);
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (i < source.length && isDigit(source[i])) i++;
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (i < source.length && isDigit(source[i])) i++;
      }
      push("number", source.slice(start, i), start);
      continue;
    }

    if (isIdentStart(ch)) {
      const start = i;
      while (i < source.length && isIdentPart(source[i])) i++;
      const word = source.slice(start, i);
      push(KEYWORD_SET.has(word) ? "keyword" : "ident", word, start);
      continue;
    }

    // Negative numbers written as `-5` in an argument position are handled by
    // the parser's unary minus, so the lexer only emits operators here.
    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      push("op", two, i);
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPS.includes(ch)) {
      push("op", ch, i);
      i++;
      continue;
    }

    if (PUNCT.includes(ch)) {
      push("punct", ch, i);
      i++;
      continue;
    }

    const near = lastMeaningful();
    throw new BlakError(
      `I don't understand the character "${ch}"${near ? ` after "${near.value}"` : ""}`,
      line
    );
  }

  if (tokens.length > 0 && tokens[tokens.length - 1].type === "newline") tokens.pop();
  tokens.push({ type: "eof", value: "", line, column: 1 });
  return tokens;
}
