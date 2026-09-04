import { BlakError } from "./types";
import type { Expr, IfBranch, Stmt, Token } from "./types";

/** Words that read as a prefix command inside an expression: `data = read "a.txt"`. */
const COMMAND_EXPRESSIONS = new Set(["read", "get"]);

/** Elements that are complete on their own, with no argument and no block. */
const BARE_DIRECTIVES = new Set(["divider", "spacer"]);

export function parse(tokens: Token[]): Stmt[] {
  let pos = 0;

  const peek = (offset = 0): Token => tokens[Math.min(pos + offset, tokens.length - 1)];
  const at = (type: string, value?: string) =>
    peek().type === type && (value === undefined || peek().value === value);
  const advance = (): Token => tokens[pos++];

  const expect = (type: string, value: string): Token => {
    if (!at(type, value)) {
      const found = peek().value || peek().type;
      throw new BlakError(`Expected "${value}" but found "${found}"`, peek().line);
    }
    return advance();
  };

  const skipNewlines = () => {
    while (at("newline")) advance();
  };

  /** True when the token can begin an expression (so it can be a directive argument). */
  const startsValue = (t: Token): boolean => {
    if (t.type === "string" || t.type === "number" || t.type === "ident") return true;
    if (t.type === "keyword") return ["true", "false", "not", "read", "get"].includes(t.value);
    if (t.type === "punct") return t.value === "(" || t.value === "[";
    if (t.type === "op") return t.value === "-" || t.value === "!";
    return false;
  };

  /**
   * `name …` is a directive (`text "hi"`, `size 500, 400`, `column { … }`) rather
   * than an expression when what follows can't continue an expression.
   */
  const looksLikeDirective = (): boolean => {
    const next = peek(1);
    if (next.type === "op") return false; // assignment or arithmetic
    if (next.type === "newline" || next.type === "eof") return false;
    if (next.type === "punct") return next.value === "{";
    return startsValue(next) || next.type === "keyword";
  };

  /* ------------------------------------------------------------ expressions */

  const parseExpression = (): Expr => parseOr();

  const parseOr = (): Expr => {
    let left = parseAnd();
    while (at("keyword", "or") || at("op", "||")) {
      const line = advance().line;
      left = { kind: "binary", op: "or", left, right: parseAnd(), line };
    }
    return left;
  };

  const parseAnd = (): Expr => {
    let left = parseEquality();
    while (at("keyword", "and") || at("op", "&&")) {
      const line = advance().line;
      left = { kind: "binary", op: "and", left, right: parseEquality(), line };
    }
    return left;
  };

  const parseEquality = (): Expr => {
    let left = parseComparison();
    while (at("op", "==") || at("op", "!=")) {
      const token = advance();
      left = { kind: "binary", op: token.value, left, right: parseComparison(), line: token.line };
    }
    return left;
  };

  const parseComparison = (): Expr => {
    let left = parseAdditive();
    while (at("op", ">") || at("op", "<") || at("op", ">=") || at("op", "<=")) {
      const token = advance();
      left = { kind: "binary", op: token.value, left, right: parseAdditive(), line: token.line };
    }
    return left;
  };

  const parseAdditive = (): Expr => {
    let left = parseMultiplicative();
    while (at("op", "+") || at("op", "-")) {
      const token = advance();
      left = { kind: "binary", op: token.value, left, right: parseMultiplicative(), line: token.line };
    }
    return left;
  };

  const parseMultiplicative = (): Expr => {
    let left = parseUnary();
    while (at("op", "*") || at("op", "/") || at("op", "%")) {
      const token = advance();
      left = { kind: "binary", op: token.value, left, right: parseUnary(), line: token.line };
    }
    return left;
  };

  const parseUnary = (): Expr => {
    if (at("keyword", "not") || at("op", "!") || at("op", "-")) {
      const token = advance();
      const op = token.value === "-" ? "-" : "not";
      return { kind: "unary", op, operand: parseUnary(), line: token.line };
    }
    return parsePostfix();
  };

  const parseArguments = (): Expr[] => {
    expect("punct", "(");
    const args: Expr[] = [];
    skipNewlines();
    while (!at("punct", ")")) {
      args.push(parseExpression());
      skipNewlines();
      if (at("punct", ",")) {
        advance();
        skipNewlines();
      }
    }
    expect("punct", ")");
    return args;
  };

  const parsePostfix = (): Expr => {
    let expr = parsePrimary();
    for (;;) {
      if (at("punct", ".")) {
        const line = advance().line;
        const name = peek();
        if (name.type !== "ident" && name.type !== "keyword") {
          throw new BlakError(`Expected a property name after "."`, line);
        }
        advance();
        expr = { kind: "member", object: expr, name: name.value, line };
      } else if (at("punct", "(")) {
        const line = peek().line;
        expr = { kind: "call", callee: expr, args: parseArguments(), line };
      } else if (at("punct", "[")) {
        const line = advance().line;
        const index = parseExpression();
        expect("punct", "]");
        expr = { kind: "index", object: expr, index, line };
      } else {
        return expr;
      }
    }
  };

  const parseListLiteral = (): Expr => {
    const line = expect("punct", "[").line;
    const items: Expr[] = [];
    skipNewlines();
    while (!at("punct", "]")) {
      items.push(parseExpression());
      skipNewlines();
      if (at("punct", ",")) {
        advance();
        skipNewlines();
      }
    }
    expect("punct", "]");
    return { kind: "list", items, line };
  };

  const parseObjectLiteral = (): Expr => {
    const line = expect("punct", "{").line;
    const entries: { key: string; value: Expr }[] = [];
    skipNewlines();
    while (!at("punct", "}")) {
      const keyToken = peek();
      if (keyToken.type !== "ident" && keyToken.type !== "string" && keyToken.type !== "keyword") {
        throw new BlakError(`Expected a property name, found "${keyToken.value}"`, keyToken.line);
      }
      advance();
      expect("punct", ":");
      entries.push({ key: keyToken.value, value: parseExpression() });
      skipNewlines();
      if (at("punct", ",")) {
        advance();
        skipNewlines();
      }
    }
    expect("punct", "}");
    return { kind: "object", entries, line };
  };

  const parsePrimary = (): Expr => {
    const token = peek();

    if (token.type === "number") {
      advance();
      return { kind: "number", value: Number(token.value), line: token.line };
    }
    if (token.type === "string") {
      advance();
      return { kind: "string", value: token.value, line: token.line };
    }
    if (token.type === "keyword" && (token.value === "true" || token.value === "false")) {
      advance();
      return { kind: "bool", value: token.value === "true", line: token.line };
    }
    if (token.type === "punct" && token.value === "(") {
      advance();
      const inner = parseExpression();
      expect("punct", ")");
      return inner;
    }
    if (token.type === "punct" && token.value === "[") return parseListLiteral();
    if (token.type === "punct" && token.value === "{") return parseObjectLiteral();

    if (token.type === "ident") {
      // `read "notes.txt"` / `get "https://…"` read as commands, not calls.
      if (COMMAND_EXPRESSIONS.has(token.value) && startsValue(peek(1))) {
        advance();
        return { kind: "command", name: token.value, arg: parseUnary(), line: token.line };
      }
      advance();
      return { kind: "ident", name: token.value, line: token.line };
    }

    throw new BlakError(
      `I expected a value here but found "${token.value || token.type}"`,
      token.line
    );
  };

  /* ------------------------------------------------------------- statements */

  const parseBlock = (): Stmt[] => {
    expect("punct", "{");
    const body: Stmt[] = [];
    skipNewlines();
    while (!at("punct", "}")) {
      if (at("eof")) throw new BlakError("A block is missing its closing }", peek().line);
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
      skipNewlines();
    }
    expect("punct", "}");
    return body;
  };

  const parseParams = (): string[] => {
    expect("punct", "(");
    const params: string[] = [];
    while (!at("punct", ")")) {
      const name = peek();
      if (name.type !== "ident") {
        throw new BlakError(`Expected a parameter name, found "${name.value}"`, name.line);
      }
      advance();
      params.push(name.value);
      if (at("punct", ",")) advance();
    }
    expect("punct", ")");
    return params;
  };

  /** After `name(` … `)`, a `{` means this is a function definition. */
  const isFunctionDefinition = (): boolean => {
    let depth = 0;
    for (let k = pos + 1; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.type === "punct" && t.value === "(") depth++;
      else if (t.type === "punct" && t.value === ")") {
        depth--;
        if (depth === 0) {
          for (let j = k + 1; j < tokens.length; j++) {
            if (tokens[j].type === "newline") continue;
            return tokens[j].type === "punct" && tokens[j].value === "{";
          }
          return false;
        }
      } else if (t.type === "newline" && depth === 0) {
        return false;
      }
    }
    return false;
  };

  const parseIf = (): Stmt => {
    const line = expect("keyword", "if").line;
    const branches: IfBranch[] = [{ cond: parseExpression(), body: parseBlock() }];
    let otherwise: Stmt[] | undefined;

    for (;;) {
      // `else` may sit on the next line
      let lookahead = 0;
      while (peek(lookahead).type === "newline") lookahead++;
      if (!(peek(lookahead).type === "keyword" && peek(lookahead).value === "else")) break;
      for (let k = 0; k < lookahead; k++) advance();
      advance(); // else
      if (at("keyword", "if")) {
        advance();
        branches.push({ cond: parseExpression(), body: parseBlock() });
      } else {
        otherwise = parseBlock();
        break;
      }
    }
    return { kind: "if", branches, otherwise, line };
  };

  const parseStatement = (): Stmt | null => {
    const token = peek();

    if (token.type === "newline") {
      advance();
      return null;
    }

    if (token.type === "keyword") {
      switch (token.value) {
        case "app": {
          advance();
          let name = "Untitled app";
          if (at("string")) name = advance().value;
          return { kind: "app", name, body: parseBlock(), line: token.line };
        }
        case "window": {
          advance();
          const args: Expr[] = [];
          if (at("string")) {
            const t = advance();
            args.push({ kind: "string", value: t.value, line: t.line });
          }
          return { kind: "directive", name: "window", args, body: parseBlock(), line: token.line };
        }
        case "if":
          return parseIf();
        case "for": {
          advance();
          const nameToken = peek();
          if (nameToken.type !== "ident") {
            throw new BlakError(`Expected a name after "for"`, nameToken.line);
          }
          advance();
          expect("keyword", "in");
          const iterable = parseExpression();
          return { kind: "for", varName: nameToken.value, iterable, body: parseBlock(), line: token.line };
        }
        case "repeat": {
          advance();
          const count = parseExpression();
          return { kind: "repeat", count, body: parseBlock(), line: token.line };
        }
        case "return": {
          advance();
          if (at("newline") || at("eof") || at("punct", "}")) {
            return { kind: "return", line: token.line };
          }
          return { kind: "return", value: parseExpression(), line: token.line };
        }
        case "on": {
          advance();
          const eventToken = peek();
          if (eventToken.type !== "ident" && eventToken.type !== "keyword") {
            throw new BlakError(`Expected an event name after "on"`, eventToken.line);
          }
          advance();
          return { kind: "on", event: eventToken.value, body: parseBlock(), line: token.line };
        }
        case "component": {
          advance();
          const nameToken = peek();
          if (nameToken.type !== "ident") {
            throw new BlakError(`Expected a component name`, nameToken.line);
          }
          advance();
          const params = at("punct", "(") ? parseParams() : [];
          return { kind: "component", name: nameToken.value, params, body: parseBlock(), line: token.line };
        }
        case "use":
        case "permission": {
          advance();
          const nameToken = peek();
          if (nameToken.type !== "ident" && nameToken.type !== "keyword") {
            throw new BlakError(`Expected a name after "${token.value}"`, nameToken.line);
          }
          advance();
          return token.value === "use"
            ? { kind: "use", name: nameToken.value, line: token.line }
            : { kind: "permission", name: nameToken.value, line: token.line };
        }
        default:
          throw new BlakError(`"${token.value}" can't start a statement here`, token.line);
      }
    }

    if (token.type === "ident") {
      // function definition: name(params) { … }
      if (peek(1).type === "punct" && peek(1).value === "(" && isFunctionDefinition()) {
        advance();
        const params = parseParams();
        return { kind: "func", name: token.value, params, body: parseBlock(), line: token.line };
      }

      if (looksLikeDirective() || BARE_DIRECTIVES.has(token.value)) {
        advance();
        const args: Expr[] = [];
        // `size 500, 400` — comma separated, ends at the block or the line end.
        while (!at("punct", "{") && !at("newline") && !at("eof") && !at("punct", "}")) {
          args.push(parseExpression());
          if (at("punct", ",")) advance();
        }
        const body = at("punct", "{") ? parseBlock() : undefined;
        return { kind: "directive", name: token.value, args, body, line: token.line };
      }
    }

    // Anything else is an expression, optionally an assignment target.
    const expr = parseExpression();
    if (at("op", "=")) {
      const line = advance().line;
      return { kind: "assign", target: expr, value: parseExpression(), line };
    }
    return { kind: "expr", expr, line: token.line };
  };

  const program: Stmt[] = [];
  skipNewlines();
  while (!at("eof")) {
    const stmt = parseStatement();
    if (stmt) program.push(stmt);
    skipNewlines();
  }
  return program;
}
