/**
 * BLAK — the native language of NovaOS.
 *
 * Source lives in `.blk` files; a packaged app is a `.blak` file. The pipeline is
 * lexer -> parser -> interpreter, and the interpreter produces a UI tree that
 * `Renderer.tsx` turns into real windows.
 */

/* ------------------------------------------------------------------ tokens */

export type TokenType =
  | "ident"
  | "keyword"
  | "number"
  | "string"
  | "op"
  | "punct"
  | "newline"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export const KEYWORDS = [
  "app", "window", "if", "else", "for", "in", "repeat", "return", "on",
  "component", "use", "permission", "true", "false", "and", "or", "not",
  "close",
] as const;

/* --------------------------------------------------------------- expressions */

export type Expr =
  | { kind: "number"; value: number; line: number }
  | { kind: "string"; value: string; line: number }
  | { kind: "bool"; value: boolean; line: number }
  | { kind: "ident"; name: string; line: number }
  | { kind: "unary"; op: string; operand: Expr; line: number }
  | { kind: "binary"; op: string; left: Expr; right: Expr; line: number }
  | { kind: "call"; callee: Expr; args: Expr[]; line: number }
  | { kind: "member"; object: Expr; name: string; line: number }
  | { kind: "index"; object: Expr; index: Expr; line: number }
  | { kind: "list"; items: Expr[]; line: number }
  | { kind: "object"; entries: { key: string; value: Expr }[]; line: number }
  /** Prefix commands that read like English: `read "a.txt"`, `get "https://…"`. */
  | { kind: "command"; name: string; arg: Expr; line: number };

/* --------------------------------------------------------------- statements */

export interface IfBranch {
  cond: Expr;
  body: Stmt[];
}

export type Stmt =
  | { kind: "app"; name: string; body: Stmt[]; line: number }
  | { kind: "assign"; target: Expr; value: Expr; line: number }
  | { kind: "func"; name: string; params: string[]; body: Stmt[]; line: number }
  | { kind: "component"; name: string; params: string[]; body: Stmt[]; line: number }
  | { kind: "if"; branches: IfBranch[]; otherwise?: Stmt[]; line: number }
  | { kind: "for"; varName: string; iterable: Expr; body: Stmt[]; line: number }
  | { kind: "repeat"; count: Expr; body: Stmt[]; line: number }
  | { kind: "return"; value?: Expr; line: number }
  | { kind: "close"; line: number }
  | { kind: "on"; event: string; body: Stmt[]; line: number }
  | { kind: "use"; name: string; line: number }
  | { kind: "permission"; name: string; line: number }
  /**
   * The uniform `name args… { block }` form. Covers UI elements (`text "hi"`),
   * property setters (`size 500, 400`), and OS commands (`notify "done"`).
   */
  | { kind: "directive"; name: string; args: Expr[]; body?: Stmt[]; line: number }
  | { kind: "expr"; expr: Expr; line: number };

/* ------------------------------------------------------------------ values */

export interface BlakFunction {
  type: "function";
  name: string;
  params: string[];
  body: Stmt[];
  closure: Scope;
}

export interface BlakObject {
  type: "object";
  fields: Map<string, BlakValue>;
}

export interface BlakList {
  type: "list";
  items: BlakValue[];
}

export interface BlakNative {
  type: "native";
  name: string;
  call: (args: BlakValue[], line: number) => BlakValue;
}

export type BlakValue =
  | string
  | number
  | boolean
  | null
  | BlakList
  | BlakObject
  | BlakFunction
  | BlakNative;

export interface Scope {
  vars: Map<string, BlakValue>;
  parent: Scope | null;
}

/* --------------------------------------------------------------------- UI */

export type UiNodeType =
  | "text"
  | "heading"
  | "subtitle"
  | "badge"
  | "divider"
  | "spacer"
  | "link"
  | "button"
  | "input"
  | "select"
  | "chart"
  | "icon"
  | "image"
  | "box"
  | "card"
  | "column"
  | "row"
  | "scrollbox"
  | "progress"
  | "toggle"
  | "avatar";

export type UiAlign = "left" | "center" | "right";
export type UiVariant = "primary" | "secondary" | "ghost" | "danger";

export interface UiStyle {
  width?: number;
  height?: number;
  minHeight?: number;
  maxHeight?: number;
  minWidth?: number;
  maxWidth?: number;
  textSize?: number;
  rounded?: number;
  /** Semantic name (accent, muted, success…) or a raw CSS colour. */
  color?: string;
  bg?: string;
  background?: string;
  bold?: boolean;
  align?: UiAlign;
  /** Container spacing, in Tailwind-ish px. */
  gap?: number;
  pad?: number;
  variant?: UiVariant;
  /** Visibility control: when true the node is hidden. */
  hidden?: boolean;
  /** Input type hint: text, number, password, email… */
  inputType?: string;
  /** Chart type: bar, line, pie */
  chartType?: string;
  /** Select options list */
  selectOptions?: string[];
  /** Shadow styling: e.g. "sm", "md", "lg", "none", or boolean */
  shadow?: string | boolean;
  /** Border styling or color */
  border?: string;
  /** Opacity 0 to 1 or 0 to 100 */
  opacity?: number;
  /** Backdrop blur / filter blur */
  blur?: number | string;
  /** Overflow behavior */
  overflow?: string;
}

export interface UiNode {
  type: UiNodeType;
  /** Stable within a build pass, used as the React key and input identity. */
  id: string;
  label: string;
  /** Secondary value: the url for `link`, the placeholder for `input`, options for `select`. */
  value?: string;
  style: UiStyle;
  children: UiNode[];
  /** Input binding name for `input username` or `toggle done`. */
  binding?: string;
  /** Click handler body plus the scope it closed over. */
  onClick?: { body: Stmt[]; scope: Scope };
  /** Select options list. */
  selectOptions?: string[];
  /** Chart data as a list of objects or a list of numbers. */
  chartData?: BlakValue;
  /** Toggle checked state */
  checked?: boolean;
  /** Progress value (0 to 100 or current value) */
  progress?: number;
  /** Progress max value (default 100) */
  progressMax?: number;
  /** Avatar URL / image source or fallback text */
  avatarUrl?: string;
}

export interface WindowSpec {
  name: string;
  title: string;
  width: number;
  height: number;
  resizable: boolean;
  body: Stmt[];
}

/* ------------------------------------------------------------------ errors */

export class BlakError extends Error {
  line: number;
  constructor(message: string, line = 0) {
    super(message);
    this.name = "BlakError";
    this.line = line;
  }
}

/* ------------------------------------------------------------- permissions */

export const PERMISSIONS = ["files", "network", "notifications", "clipboard", "system"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  files: "Read and write your files",
  network: "Make network requests",
  notifications: "Send you notifications",
  clipboard: "Write to your clipboard",
  system: "Change system settings like the theme",
};

/* ------------------------------------------------------------------- host */

/** Everything a BLAK program can do to the OS. Implemented in `host.ts`. */
export interface BlakHost {
  permissions: Set<string>;
  readFile: (path: string) => string;
  writeFile: (path: string, content: string) => void;
  makeFolder: (path: string) => void;
  listFolder: (path: string) => string[];
  fileExists: (path: string) => boolean;
  deleteFile: (path: string) => void;
  moveFile: (from: string, to: string) => void;
  notify: (message: string) => void;
  openApp: (name: string) => void;
  openBrowser: (url: string) => void;
  copyText: (text: string) => void;
  setTheme: (theme: string) => void;
  /** Cached HTTP GET. Returns the value, or null while the request is pending. */
  fetchGet: (url: string) => BlakValue;
  fetchPost: (url: string, body: BlakValue) => void;
  /** Called when the app declares another window and something wants it open. */
  openWindow: (name: string) => void;
  /** Close the current window. */
  closeWindow: () => void;
}
