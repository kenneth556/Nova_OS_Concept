import { BlakError } from "./types";
import type {
  BlakFunction, BlakHost, BlakList, BlakNative, BlakObject, BlakValue, Expr, Scope, Stmt, UiNode,
  UiStyle, WindowSpec,
} from "./types";

/* ------------------------------------------------------------------ values */

const list = (items: BlakValue[]): BlakList => ({ type: "list", items });
const object = (fields: Map<string, BlakValue>): BlakObject => ({ type: "object", fields });

const isList = (v: BlakValue): v is BlakList => typeof v === "object" && v !== null && (v as any).type === "list";
const isObject = (v: BlakValue): v is BlakObject => typeof v === "object" && v !== null && (v as any).type === "object";
const isFunction = (v: BlakValue): v is BlakFunction => typeof v === "object" && v !== null && (v as any).type === "function";
const isNative = (v: BlakValue): v is BlakNative => typeof v === "object" && v !== null && (v as any).type === "native";

export const toText = (value: BlakValue): string => {
  if (value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  if (typeof value === "boolean") return value ? "true" : "false";
  if (isList(value)) return `[${value.items.map(toText).join(", ")}]`;
  if (isObject(value)) {
    return `{${[...value.fields.entries()].map(([k, v]) => `${k}: ${toText(v)}`).join(", ")}}`;
  }
  if (isFunction(value) || isNative(value)) return `<${value.name}>`;
  return String(value);
};

const truthy = (value: BlakValue): boolean => {
  if (value === null || value === false) return false;
  if (value === 0 || value === "") return false;
  if (isList(value)) return value.items.length > 0;
  return true;
};

const toNumber = (value: BlakValue, line: number): number => {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n) && value.trim() !== "") return n;
  }
  throw new BlakError(`"${toText(value)}" isn't a number`, line);
};

export { toNumber };

/* -------------------------------------------------------------------- scope */

const childScope = (parent: Scope): Scope => ({ vars: new Map(), parent });

const lookup = (scope: Scope, name: string): { scope: Scope } | null => {
  let current: Scope | null = scope;
  while (current) {
    if (current.vars.has(name)) return { scope: current };
    current = current.parent;
  }
  return null;
};

/* ------------------------------------------------------------- static info */

export interface BlakAppInfo {
  name: string;
  permissions: string[];
  windows: { name: string; title: string; width: number; height: number }[];
  uses: string[];
}

const staticString = (expr: Expr | undefined, fallback: string): string =>
  expr && expr.kind === "string" ? expr.value : fallback;

const staticNumber = (expr: Expr | undefined, fallback: number): number =>
  expr && expr.kind === "number" ? expr.value : fallback;

/** Reads the manifest-ish facts out of a program without running it. */
export function analyze(program: Stmt[]): BlakAppInfo {
  const info: BlakAppInfo = { name: "Untitled app", permissions: [], windows: [], uses: [] };
  const appDecl = program.find((s) => s.kind === "app");
  const body = appDecl && appDecl.kind === "app" ? appDecl.body : program;
  if (appDecl && appDecl.kind === "app") info.name = appDecl.name;

  for (const stmt of body) {
    if (stmt.kind === "permission" && !info.permissions.includes(stmt.name)) {
      info.permissions.push(stmt.name);
    } else if (stmt.kind === "use" && !info.uses.includes(stmt.name)) {
      info.uses.push(stmt.name);
    } else if (stmt.kind === "directive" && stmt.name === "window") {
      const declaredName = staticString(stmt.args[0], `Window ${info.windows.length + 1}`);
      let title = declaredName;
      let width = 520;
      let height = 400;
      for (const inner of stmt.body ?? []) {
        if (inner.kind !== "directive") continue;
        if (inner.name === "title") title = staticString(inner.args[0], title);
        if (inner.name === "size") {
          width = staticNumber(inner.args[0], width);
          height = staticNumber(inner.args[1], height);
        }
      }
      info.windows.push({ name: declaredName, title, width, height });
    }
  }
  return info;
}

/* ------------------------------------------------------------------ runtime */

const UI_ELEMENTS = new Set([
  "text", "heading", "subtitle", "badge", "divider", "spacer", "link",
  "button", "input", "select", "chart", "icon", "image", "box", "card", "column", "row",
  "scrollbox", "progress", "toggle", "avatar",
]);
const CONTAINERS = new Set(["box", "card", "column", "row", "scrollbox"]);
const STYLE_DIRECTIVES = new Set([
  "size", "width", "height", "text_size", "rounded", "title", "resizable",
  "color", "bold", "align", "gap", "pad", "padding", "variant", "visible", "type",
  "placeholder", "shadow", "border", "opacity", "blur", "bg", "background",
  "min_height", "max_height", "min_width", "max_width", "overflow",
]);
/** Style directives whose argument reads as a name, not a variable. */
const STYLE_WORDS = new Set(["color", "align", "variant", "shadow", "overflow"]);
/** Directives whose bare-identifier argument is a name, not a variable. */
const BAREWORD_DIRECTIVES = new Set(["theme", "input", "toggle"]);

const MAX_STEPS = 400_000;
const MAX_LOOP = 20_000;

class ReturnSignal {
  value: BlakValue;
  constructor(value: BlakValue) {
    this.value = value;
  }
}

interface BuildTarget {
  out: UiNode[] | null;
  node: UiNode | null;
  style: UiStyle | null;
  window: WindowSpec | null;
}

const NO_TARGET: BuildTarget = { out: null, node: null, style: null, window: null };

export class BlakRuntime {
  program: Stmt[];
  host: BlakHost;
  appName = "Untitled app";
  permissions = new Set<string>();
  windows: WindowSpec[] = [];
  globals: Scope = { vars: new Map(), parent: null };
  /** Lines produced by `show` while building the UI; reset on every rebuild. */
  buildLog: string[] = [];
  /** Lines produced by `show` inside handlers; kept across rebuilds. */
  eventLog: string[] = [];
  inputs = new Map<string, string>();
  error: BlakError | null = null;

  private onChange: () => void;
  private steps = 0;
  private nodeSeq = 0;
  private closeHandlers: Stmt[][] = [];

  constructor(program: Stmt[], host: BlakHost, onChange: () => void) {
    this.program = program;
    this.host = host;
    this.onChange = onChange;
    this.installBuiltins();
  }

  /* ------------------------------------------------------------- lifecycle */

  start(): void {
    this.error = null;
    try {
      const appDecl = this.program.find((s) => s.kind === "app");
      const body = appDecl && appDecl.kind === "app" ? appDecl.body : this.program;
      if (appDecl && appDecl.kind === "app") this.appName = appDecl.name;

      // Pass 1: declarations, permissions and window specs.
      for (const stmt of body) {
        if (stmt.kind === "permission") {
          this.permissions.add(stmt.name);
        } else if (stmt.kind === "func" || stmt.kind === "component") {
          this.declare(stmt);
        } else if (stmt.kind === "directive" && stmt.name === "window") {
          this.registerWindow(stmt);
        } else if (stmt.kind === "on" && stmt.event === "close") {
          this.closeHandlers.push(stmt.body);
        }
      }
      this.host.permissions = this.permissions;

      // Pass 2: top-level setup (variables, files, notifications).
      for (const stmt of body) {
        if (
          stmt.kind === "permission" ||
          stmt.kind === "func" ||
          stmt.kind === "component" ||
          stmt.kind === "on" ||
          (stmt.kind === "directive" && stmt.name === "window")
        ) {
          continue;
        }
        this.execStatement(stmt, this.globals, NO_TARGET);
      }

      // `on open` runs after setup.
      for (const stmt of body) {
        if (stmt.kind === "on" && stmt.event === "open") {
          this.execBlock(stmt.body, childScope(this.globals), NO_TARGET);
        }
      }
    } catch (err) {
      this.captureError(err);
    }
  }

  close(): void {
    try {
      for (const body of this.closeHandlers) {
        this.execBlock(body, childScope(this.globals), NO_TARGET);
      }
    } catch {
      /* closing must never throw into React */
    }
  }

  windowNames(): string[] {
    return this.windows.map((w) => w.name);
  }

  /** Executes a window body and returns its UI tree. */
  buildWindow(windowName?: string): { spec: WindowSpec | null; nodes: UiNode[] } {
    const spec = windowName
      ? this.windows.find((w) => w.name === windowName) ?? this.windows[0] ?? null
      : this.windows[0] ?? null;

    this.buildLog = [];
    this.nodeSeq = 0;
    this.steps = 0;
    if (!spec) return { spec: null, nodes: [] };

    const nodes: UiNode[] = [];
    try {
      this.execBlock(spec.body, childScope(this.globals), {
        out: nodes,
        node: null,
        style: null,
        window: spec,
      });
    } catch (err) {
      this.captureError(err);
    }
    return { spec, nodes };
  }

  /** Runs a click handler, then asks React to rebuild the tree. */
  invoke(body: Stmt[], scope: Scope): void {
    this.steps = 0;
    try {
      this.execBlock(body, childScope(scope), NO_TARGET);
    } catch (err) {
      if (!(err instanceof ReturnSignal)) this.captureError(err);
    }
    this.onChange();
  }

  setInput(name: string, value: string): void {
    this.inputs.set(name, value);
    this.globals.vars.set(name, value);
    this.onChange();
  }

  toggleInput(name: string): void {
    const found = lookup(this.globals, name);
    const targetScope = found ? found.scope : this.globals;
    const current = targetScope.vars.get(name);
    const next = !truthy(current ?? false);
    targetScope.vars.set(name, next);
    this.inputs.set(name, next ? "true" : "false");
    this.onChange();
  }

  /** Called by the host when an async request resolves. */
  refresh(): void {
    this.onChange();
  }

  private captureError(err: unknown) {
    this.error = err instanceof BlakError ? err : new BlakError(String((err as Error)?.message ?? err));
  }

  /* -------------------------------------------------------------- builtins */

  private native(name: string, call: (args: BlakValue[], line: number) => BlakValue): BlakNative {
    return { type: "native", name, call };
  }

  private installBuiltins() {
    const g = this.globals.vars;
    const arg = (args: BlakValue[], i: number): BlakValue => args[i] ?? null;

    g.set("length", this.native("length", (args, line) => {
      const value = arg(args, 0);
      if (isList(value)) return value.items.length;
      if (typeof value === "string") return value.length;
      if (isObject(value)) return value.fields.size;
      throw new BlakError("length() needs a list or some text", line);
    }));
    g.set("upper", this.native("upper", (args) => toText(arg(args, 0)).toUpperCase()));
    g.set("lower", this.native("lower", (args) => toText(arg(args, 0)).toLowerCase()));
    g.set("round", this.native("round", (args, line) => Math.round(toNumber(arg(args, 0), line))));
    g.set("floor", this.native("floor", (args, line) => Math.floor(toNumber(arg(args, 0), line))));
    g.set("ceil", this.native("ceil", (args, line) => Math.ceil(toNumber(arg(args, 0), line))));
    g.set("random", this.native("random", (args, line) => {
      if (args.length === 0) return Math.random();
      const max = toNumber(arg(args, 0), line);
      return Math.floor(Math.random() * max);
    }));
    g.set("number", this.native("number", (args) => {
      const value = arg(args, 0);
      if (typeof value === "number") return value;
      const parsed = Number(toText(value));
      // Lenient on purpose: an empty or half-typed field reads as 0 rather than
      // throwing in the middle of a form.
      return Number.isFinite(parsed) ? parsed : 0;
    }));
    g.set("string", this.native("string", (args) => toText(arg(args, 0))));
    g.set("join", this.native("join", (args) => {
      const value = arg(args, 0);
      const sep = toText(arg(args, 1) ?? ", ");
      return isList(value) ? value.items.map(toText).join(sep) : toText(value);
    }));
    g.set("split", this.native("split", (args) =>
      list(toText(arg(args, 0)).split(toText(arg(args, 1) ?? " ")))
    ));
    g.set("contains", this.native("contains", (args) => {
      const haystack = arg(args, 0);
      const needle = toText(arg(args, 1));
      if (isList(haystack)) return haystack.items.some((item) => toText(item) === needle);
      return toText(haystack).includes(needle);
    }));
    g.set("keys", this.native("keys", (args) => {
      const value = arg(args, 0);
      return isObject(value) ? list([...value.fields.keys()]) : list([]);
    }));
    g.set("add", this.native("add", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) throw new BlakError("add() needs a list as its first value", line);
      target.items.push(arg(args, 1));
      return target;
    }));
    g.set("remove", this.native("remove", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) throw new BlakError("remove() needs a list as its first value", line);
      const itemOrFn = arg(args, 1);
      if (isFunction(itemOrFn) || isNative(itemOrFn)) {
        target.items = target.items.filter((it) => !truthy(this.callValue(itemOrFn, [it], line, NO_TARGET)));
      } else {
        const idx = target.items.findIndex((it) => this.equals(it, itemOrFn));
        if (idx !== -1) target.items.splice(idx, 1);
      }
      return target;
    }));
    g.set("remove_at", this.native("remove_at", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) throw new BlakError("remove_at() needs a list", line);
      const idx = Math.floor(toNumber(arg(args, 1), line));
      if (idx >= 0 && idx < target.items.length) {
        target.items.splice(idx, 1);
      }
      return target;
    }));
    g.set("filter", this.native("filter", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) throw new BlakError("filter() needs a list", line);
      const predicate = arg(args, 1);
      if (isFunction(predicate) || isNative(predicate)) {
        return list(target.items.filter((it) => truthy(this.callValue(predicate, [it], line, NO_TARGET))));
      }
      if (typeof predicate === "string") {
        return list(target.items.filter((it) => {
          if (isObject(it)) return truthy(it.fields.get(predicate) ?? false);
          return toText(it) === predicate;
        }));
      }
      return list(target.items.filter((it) => this.equals(it, predicate)));
    }));
    g.set("map", this.native("map", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) throw new BlakError("map() needs a list", line);
      const fn = arg(args, 1);
      if (isFunction(fn) || isNative(fn)) {
        return list(target.items.map((it) => this.callValue(fn, [it], line, NO_TARGET)));
      }
      if (typeof fn === "string") {
        return list(target.items.map((it) => isObject(it) ? (it.fields.get(fn) ?? null) : null));
      }
      return target;
    }));
    g.set("find", this.native("find", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) return null;
      const predicate = arg(args, 1);
      if (isFunction(predicate) || isNative(predicate)) {
        const found = target.items.find((it) => truthy(this.callValue(predicate, [it], line, NO_TARGET)));
        return found ?? null;
      }
      if (typeof predicate === "string") {
        const found = target.items.find((it) => isObject(it) && truthy(it.fields.get(predicate) ?? false));
        return found ?? null;
      }
      const found = target.items.find((it) => this.equals(it, predicate));
      return found ?? null;
    }));
    g.set("sort", this.native("sort", (args) => {
      const target = arg(args, 0);
      if (!isList(target)) return list([]);
      const key = arg(args, 1);
      const copy = [...target.items];
      if (typeof key === "string") {
        copy.sort((a, b) => {
          const valA = (isObject(a) ? a.fields.get(key) : a) ?? null;
          const valB = (isObject(b) ? b.fields.get(key) : b) ?? null;
          if (typeof valA === "number" && typeof valB === "number") return valA - valB;
          return toText(valA).localeCompare(toText(valB));
        });
      } else {
        copy.sort((a, b) => {
          if (typeof a === "number" && typeof b === "number") return a - b;
          return toText(a).localeCompare(toText(b));
        });
      }
      return list(copy);
    }));
    g.set("sum", this.native("sum", (args, line) => {
      const target = arg(args, 0);
      if (!isList(target)) return 0;
      const key = arg(args, 1);
      let total = 0;
      for (const it of target.items) {
        if (typeof key === "string" && isObject(it)) {
          total += toNumber(it.fields.get(key) ?? 0, line);
        } else {
          total += toNumber(it, line);
        }
      }
      return total;
    }));
    g.set("min", this.native("min", (args, line) => {
      if (args.length === 1 && isList(args[0])) {
        const items = args[0].items.map((it) => toNumber(it, line));
        return items.length > 0 ? Math.min(...items) : 0;
      }
      return Math.min(toNumber(arg(args, 0), line), toNumber(arg(args, 1), line));
    }));
    g.set("max", this.native("max", (args, line) => {
      if (args.length === 1 && isList(args[0])) {
        const items = args[0].items.map((it) => toNumber(it, line));
        return items.length > 0 ? Math.max(...items) : 0;
      }
      return Math.max(toNumber(arg(args, 0), line), toNumber(arg(args, 1), line));
    }));
    g.set("clamp", this.native("clamp", (args, line) => {
      const val = toNumber(arg(args, 0), line);
      const lo = toNumber(arg(args, 1), line);
      const hi = toNumber(arg(args, 2), line);
      return Math.max(lo, Math.min(hi, val));
    }));
    g.set("now", this.native("now", () => new Date().toLocaleString()));
    g.set("encode", this.native("encode", (args) => encodeURIComponent(toText(arg(args, 0)))));

    const files = new Map<string, BlakValue>();
    files.set("list", this.native("files.list", (args) =>
      list(this.host.listFolder(toText(arg(args, 0) ?? "/home/user")))
    ));
    files.set("exists", this.native("files.exists", (args) => this.host.fileExists(toText(arg(args, 0)))));
    files.set("read", this.native("files.read", (args) => this.host.readFile(toText(arg(args, 0)))));
    files.set("write", this.native("files.write", (args) => {
      this.host.writeFile(toText(arg(args, 0)), toText(arg(args, 1)));
      return null;
    }));
    files.set("delete", this.native("files.delete", (args) => {
      this.host.deleteFile(toText(arg(args, 0)));
      return null;
    }));
    files.set("move", this.native("files.move", (args) => {
      this.host.moveFile(toText(arg(args, 0)), toText(arg(args, 1)));
      return null;
    }));
    g.set("files", object(files));

    const system = new Map<string, BlakValue>();
    system.set("theme", this.native("system.theme", (args) => {
      this.host.setTheme(toText(arg(args, 0)));
      return null;
    }));
    system.set("time", this.native("system.time", () => new Date().toLocaleTimeString()));
    system.set("notify", this.native("system.notify", (args) => {
      this.host.notify(toText(arg(args, 0)));
      return null;
    }));
    g.set("system", object(system));
  }

  /* ------------------------------------------------------------ statements */

  private declare(stmt: Stmt) {
    if (stmt.kind !== "func" && stmt.kind !== "component") return;
    const fn: BlakFunction = {
      type: "function",
      name: stmt.name,
      params: stmt.params,
      body: stmt.body,
      closure: this.globals,
    };
    this.globals.vars.set(stmt.name, fn);
  }

  private registerWindow(stmt: Stmt) {
    if (stmt.kind !== "directive" || !stmt.body) return;
    const declaredName = stmt.args[0] && stmt.args[0].kind === "string"
      ? stmt.args[0].value
      : `Window ${this.windows.length + 1}`;

    const spec: WindowSpec = {
      name: declaredName,
      title: declaredName,
      width: 520,
      height: 420,
      resizable: true,
      body: stmt.body,
    };
    for (const inner of stmt.body) {
      if (inner.kind !== "directive") continue;
      if (inner.name === "title" && inner.args[0]?.kind === "string") spec.title = inner.args[0].value;
      if (inner.name === "size") {
        if (inner.args[0]?.kind === "number") spec.width = inner.args[0].value;
        if (inner.args[1]?.kind === "number") spec.height = inner.args[1].value;
      }
      if (inner.name === "resizable" && inner.args[0]?.kind === "bool") spec.resizable = inner.args[0].value;
    }
    this.windows.push(spec);
  }

  private tick(line: number) {
    this.steps++;
    if (this.steps > MAX_STEPS) {
      throw new BlakError("This program is doing too much work at once — check for a loop that never ends", line);
    }
  }

  private execBlock(body: Stmt[], scope: Scope, target: BuildTarget) {
    for (const stmt of body) this.execStatement(stmt, scope, target);
  }

  private execStatement(stmt: Stmt, scope: Scope, target: BuildTarget) {
    this.tick(stmt.line);

    switch (stmt.kind) {
      case "app":
        // A nested app declaration just runs its body.
        this.execBlock(stmt.body, scope, target);
        return;

      case "assign": {
        const value = this.evaluate(stmt.value, scope);
        this.assign(stmt.target, value, scope);
        return;
      }

      case "func":
      case "component": {
        const fn: BlakFunction = {
          type: "function",
          name: stmt.name,
          params: stmt.params,
          body: stmt.body,
          closure: scope,
        };
        scope.vars.set(stmt.name, fn);
        return;
      }

      case "if": {
        for (const branch of stmt.branches) {
          if (truthy(this.evaluate(branch.cond, scope))) {
            this.execBlock(branch.body, childScope(scope), target);
            return;
          }
        }
        if (stmt.otherwise) this.execBlock(stmt.otherwise, childScope(scope), target);
        return;
      }

      case "for": {
        const iterable = this.evaluate(stmt.iterable, scope);
        const items = isList(iterable)
          ? iterable.items
          : isObject(iterable)
            ? [...iterable.fields.keys()]
            : typeof iterable === "string"
              ? iterable.split("")
              : null;
        if (items === null) {
          throw new BlakError(`"for" needs a list to loop over`, stmt.line);
        }
        let count = 0;
        for (const item of items) {
          if (++count > MAX_LOOP) throw new BlakError("This loop ran too many times", stmt.line);
          const inner = childScope(scope);
          inner.vars.set(stmt.varName, item);
          this.execBlock(stmt.body, inner, target);
        }
        return;
      }

      case "repeat": {
        const times = Math.floor(toNumber(this.evaluate(stmt.count, scope), stmt.line));
        if (times > MAX_LOOP) throw new BlakError("This loop ran too many times", stmt.line);
        for (let i = 0; i < times; i++) {
          const inner = childScope(scope);
          inner.vars.set("index", i + 1);
          this.execBlock(stmt.body, inner, target);
        }
        return;
      }

      case "return":
        throw new ReturnSignal(stmt.value ? this.evaluate(stmt.value, scope) : null);

      case "on":
        // Registered by start(); reaching here means it was declared inside a
        // window, where only `close` still makes sense.
        if (stmt.event === "close" && !this.closeHandlers.includes(stmt.body)) {
          this.closeHandlers.push(stmt.body);
        }
        return;

      case "use":
      case "permission":
        return;

      case "expr": {
        // A bare call inside a UI block (a component) must be able to add nodes
        // to the container it sits in.
        if (stmt.expr.kind === "call") {
          const callee = this.evaluate(stmt.expr.callee, scope);
          const args = stmt.expr.args.map((a) => this.evaluate(a, scope));
          this.callValue(callee, args, stmt.line, target);
          return;
        }
        this.evaluate(stmt.expr, scope);
        return;
      }

      case "directive":
        this.execDirective(stmt, scope, target);
        return;
    }
  }

  private assign(targetExpr: Expr, value: BlakValue, scope: Scope) {
    if (targetExpr.kind === "ident") {
      const found = lookup(scope, targetExpr.name);
      (found ? found.scope : this.globals).vars.set(targetExpr.name, value);
      // Assigning to a bound field name also updates the visible input, so
      // `newItem = ""` genuinely clears the box.
      if (this.inputs.has(targetExpr.name)) {
        this.inputs.set(targetExpr.name, toText(value));
      }
      return;
    }
    if (targetExpr.kind === "member") {
      const owner = this.evaluate(targetExpr.object, scope);
      if (!isObject(owner)) throw new BlakError(`Can't set "${targetExpr.name}" on that value`, targetExpr.line);
      owner.fields.set(targetExpr.name, value);
      return;
    }
    if (targetExpr.kind === "index") {
      const owner = this.evaluate(targetExpr.object, scope);
      const index = this.evaluate(targetExpr.index, scope);
      if (isList(owner)) {
        owner.items[Math.floor(toNumber(index, targetExpr.line))] = value;
        return;
      }
      if (isObject(owner)) {
        owner.fields.set(toText(index), value);
        return;
      }
    }
    throw new BlakError("That isn't something you can assign to", targetExpr.line);
  }

  /* ------------------------------------------------------------ directives */

  private directiveText(stmt: Stmt & { kind: "directive" }, scope: Scope, index = 0): string {
    const argExpr = stmt.args[index];
    if (!argExpr) return "";
    if (BAREWORD_DIRECTIVES.has(stmt.name) && argExpr.kind === "ident") return argExpr.name;
    return toText(this.evaluate(argExpr, scope));
  }

  /** `color accent` and `align center` read as words, not variable lookups. */
  private directiveWord(stmt: Stmt & { kind: "directive" }, scope: Scope, index = 0): string {
    const argExpr = stmt.args[index];
    if (!argExpr) return "";
    if (argExpr.kind === "ident") return argExpr.name;
    return toText(this.evaluate(argExpr, scope));
  }

  private applyStyle(stmt: Stmt & { kind: "directive" }, scope: Scope, target: BuildTarget) {
    const numberArg = (i: number, fallback?: number) => {
      const expr = stmt.args[i];
      return expr ? Math.round(toNumber(this.evaluate(expr, scope), stmt.line)) : fallback;
    };

    if (stmt.name === "title") {
      if (target.window) target.window.title = this.directiveText(stmt, scope);
      return;
    }
    if (stmt.name === "resizable") {
      const flag = stmt.args[0] ? truthy(this.evaluate(stmt.args[0], scope)) : true;
      if (target.window) target.window.resizable = flag;
      return;
    }
    if (stmt.name === "size") {
      const width = numberArg(0);
      const height = numberArg(1);
      if (target.node) {
        if (width !== undefined) target.node.style.width = width;
        if (height !== undefined) target.node.style.height = height;
      } else if (target.window) {
        if (width !== undefined) target.window.width = width;
        if (height !== undefined) target.window.height = height;
      }
      return;
    }
    if (stmt.name === "width") {
      const value = numberArg(0);
      if (value !== undefined) {
        if (target.node) target.node.style.width = value;
        else if (target.window) target.window.width = value;
      }
      return;
    }
    if (stmt.name === "height") {
      const value = numberArg(0);
      if (value !== undefined) {
        if (target.node) target.node.style.height = value;
        else if (target.window) target.window.height = value;
      }
      return;
    }

    const style = target.node?.style;
    if (!style) return;

    if (stmt.name === "text_size") style.textSize = numberArg(0);
    else if (stmt.name === "rounded") style.rounded = numberArg(0);
    else if (stmt.name === "gap") style.gap = numberArg(0);
    else if (stmt.name === "pad" || stmt.name === "padding") style.pad = numberArg(0);
    else if (stmt.name === "min_height") style.minHeight = numberArg(0);
    else if (stmt.name === "max_height") style.maxHeight = numberArg(0);
    else if (stmt.name === "min_width") style.minWidth = numberArg(0);
    else if (stmt.name === "max_width") style.maxWidth = numberArg(0);
    else if (stmt.name === "opacity") {
      const opVal = toNumber(this.evaluate(stmt.args[0], scope), stmt.line);
      style.opacity = opVal > 1 ? opVal / 100 : opVal;
    } else if (stmt.name === "blur") {
      const bVal = stmt.args[0] ? this.evaluate(stmt.args[0], scope) : 8;
      style.blur = typeof bVal === "number" ? bVal : toText(bVal);
    } else if (stmt.name === "shadow") {
      if (stmt.args[0]) {
        const sVal = this.evaluate(stmt.args[0], scope);
        style.shadow = typeof sVal === "boolean" ? sVal : toText(sVal);
      } else {
        style.shadow = true;
      }
    } else if (stmt.name === "border") {
      style.border = stmt.args[0] ? toText(this.evaluate(stmt.args[0], scope)) : "1px solid rgba(255,255,255,0.1)";
    } else if (stmt.name === "bg" || stmt.name === "background") {
      style.bg = stmt.args[0] ? toText(this.evaluate(stmt.args[0], scope)) : undefined;
    } else if (stmt.name === "overflow") {
      style.overflow = this.directiveWord(stmt, scope);
    } else if (stmt.name === "bold") {
      style.bold = stmt.args[0] ? truthy(this.evaluate(stmt.args[0], scope)) : true;
    } else if (stmt.name === "visible") {
      style.hidden = !truthy(this.evaluate(stmt.args[0] ?? { kind: "bool", value: true, line: stmt.line }, scope));
    } else if (stmt.name === "type") {
      style.inputType = this.directiveWord(stmt, scope);
    } else if (stmt.name === "placeholder") {
      if (target.node) target.node.value = this.directiveText(stmt, scope);
      return;
    } else if (STYLE_WORDS.has(stmt.name)) {
      const word = this.directiveWord(stmt, scope);
      if (stmt.name === "color") style.color = word;
      else if (stmt.name === "align") style.align = word as UiStyle["align"];
      else if (stmt.name === "variant") style.variant = word as UiStyle["variant"];
      else if (stmt.name === "shadow") style.shadow = word;
      else if (stmt.name === "border") style.border = word;
      else if (stmt.name === "overflow") style.overflow = word;
    }
  }

  private execDirective(stmt: Stmt & { kind: "directive" }, scope: Scope, target: BuildTarget) {
    const name = stmt.name;

    if (name === "window") return; // declared, not executed inline

    if (STYLE_DIRECTIVES.has(name)) {
      this.applyStyle(stmt, scope, target);
      return;
    }

    if (UI_ELEMENTS.has(name)) {
      this.buildElement(stmt, scope, target);
      return;
    }

    switch (name) {
      case "show": {
        const text = stmt.args.map((a) => toText(this.evaluate(a, scope))).join(" ");
        if (target.out) this.buildLog.push(text);
        else this.eventLog.push(text);
        return;
      }
      case "notify":
        this.host.notify(this.directiveText(stmt, scope));
        return;
      case "open": {
        const requested = this.directiveText(stmt, scope);
        if (this.windows.some((w) => w.name === requested)) this.host.openWindow(requested);
        else this.host.openApp(requested);
        return;
      }
      case "browser":
        this.host.openBrowser(this.directiveText(stmt, scope));
        return;
      case "copy":
        this.host.copyText(this.directiveText(stmt, scope));
        return;
      case "theme":
        this.host.setTheme(this.directiveText(stmt, scope));
        return;
      case "folder":
        this.host.makeFolder(this.directiveText(stmt, scope));
        return;
      case "save": {
        const path = this.directiveText(stmt, scope);
        const fields = this.blockFields(stmt.body ?? [], scope);
        const content = fields.get("content");
        this.host.writeFile(path, content === undefined ? "" : toText(content));
        return;
      }
      case "post": {
        const url = this.directiveText(stmt, scope);
        this.host.fetchPost(url, object(this.blockFields(stmt.body ?? [], scope)));
        return;
      }
      case "close":
        this.host.closeWindow();
        return;
      case "click":
        // Handled while building a button; a stray `click` block does nothing.
        return;
      case "option":
      case "data":
      case "value":
      case "label":
        return;
      default: {
        // Unknown name with a call-like shape is probably a component call.
        const found = lookup(scope, name);
        if (found) {
          const fn = found.scope.vars.get(name)!;
          const args = stmt.args.map((a) => this.evaluate(a, scope));
          this.callValue(fn, args, stmt.line, target);
          return;
        }
        throw new BlakError(`I don't know what "${name}" means`, stmt.line);
      }
    }
  }

  /** Turns `{ name = "Papa" \n age = 19 }` into a field map. */
  private blockFields(body: Stmt[], scope: Scope): Map<string, BlakValue> {
    const inner = childScope(scope);
    for (const stmt of body) {
      if (stmt.kind === "assign" && stmt.target.kind === "ident") {
        inner.vars.set(stmt.target.name, this.evaluate(stmt.value, inner));
      } else {
        this.execStatement(stmt, inner, NO_TARGET);
      }
    }
    return inner.vars;
  }

  private buildElement(stmt: Stmt & { kind: "directive" }, scope: Scope, target: BuildTarget) {
    const node: UiNode = {
      type: stmt.name as UiNode["type"],
      id: `n${this.nodeSeq++}`,
      label: "",
      style: {},
      children: [],
    };

    if (stmt.name === "input") {
      // `input username` binds the field to a variable of that name.
      const binding = this.directiveText(stmt, scope) || `field${node.id}`;
      node.binding = binding;
      node.value = stmt.args[1] ? toText(this.evaluate(stmt.args[1], scope)) : "";
      const existing = this.inputs.get(binding) ?? "";
      this.inputs.set(binding, existing);
      this.globals.vars.set(binding, existing);
    } else if (stmt.name === "select") {
      // `select category` binds to a variable, optional second arg is default value.
      const binding = this.directiveText(stmt, scope) || `field${node.id}`;
      node.binding = binding;
      node.value = stmt.args[1] ? toText(this.evaluate(stmt.args[1], scope)) : "";
      const existing = this.inputs.get(binding) ?? node.value;
      this.inputs.set(binding, existing);
      this.globals.vars.set(binding, existing);
      // Collect options from body: `option "Food"` style directives or a list expression.
      const options: string[] = [];
      for (const inner of (stmt.body ?? [])) {
        if (inner.kind === "directive" && inner.name === "option") {
          options.push(this.directiveText(inner, scope));
        }
      }
      node.selectOptions = options.length > 0 ? options : ["Option 1", "Option 2"];
    } else if (stmt.name === "chart") {
      node.chartData = stmt.args[0] ? this.evaluate(stmt.args[0], scope) : list([]);
      if (stmt.args[1]) node.style.chartType = this.directiveWord(stmt, scope, 1);
      // Also support body directives: `data expr`, `value expr`, `label expr`
      const body = stmt.body ?? [];
      const dataDirective = body.find((s) => s.kind === "directive" && s.name === "data");
      const valueDirective = body.find((s) => s.kind === "directive" && s.name === "value");
      const labelDirective = body.find((s) => s.kind === "directive" && s.name === "label");
      if (dataDirective && dataDirective.kind === "directive") node.chartData = this.evaluate(dataDirective.args[0] ?? { kind: "list", items: [], line: stmt.line }, scope);
      if (valueDirective && valueDirective.kind === "directive" && node.chartData && (node.chartData as any).type === "list") {
        const valueField = this.directiveText(valueDirective, scope);
        node.chartData = list((node.chartData as any).items.map((item: any) => {
          if (item.type === "object") {
            const fields = new Map<string, BlakValue>(item.fields as any);
            fields.set("value", fields.get(valueField) ?? 0);
            return object(fields);
          }
          return item;
        }));
      }
      if (labelDirective && labelDirective.kind === "directive" && node.chartData && (node.chartData as any).type === "list") {
        const labelField = this.directiveText(labelDirective, scope);
        node.chartData = list((node.chartData as any).items.map((item: any) => {
          if (item.type === "object") {
            const fields = new Map<string, BlakValue>(item.fields as any);
            fields.set("label", fields.get(labelField) ?? "?");
            return object(fields);
          }
          return item;
        }));
      }
    } else if (stmt.name === "toggle") {
      let binding: string | undefined;
      let label = "";
      if (stmt.args.length === 1) {
        if (stmt.args[0].kind === "ident") {
          binding = stmt.args[0].name;
          label = binding;
        } else {
          label = toText(this.evaluate(stmt.args[0], scope));
        }
      } else if (stmt.args.length >= 2) {
        label = toText(this.evaluate(stmt.args[0], scope));
        if (stmt.args[1].kind === "ident") {
          binding = stmt.args[1].name;
        } else {
          binding = toText(this.evaluate(stmt.args[1], scope));
        }
      }
      node.label = label;
      node.binding = binding;
      if (binding) {
        const found = lookup(scope, binding);
        const val = found ? found.scope.vars.get(binding) : this.globals.vars.get(binding);
        node.checked = truthy(val ?? false);
      } else {
        node.checked = false;
      }
    } else if (stmt.name === "progress") {
      let val = 0;
      let maxVal = 100;
      let label = "";
      if (stmt.args.length === 1) {
        val = toNumber(this.evaluate(stmt.args[0], scope), stmt.line);
      } else if (stmt.args.length === 2) {
        if (stmt.args[0].kind === "string") {
          label = stmt.args[0].value;
          val = toNumber(this.evaluate(stmt.args[1], scope), stmt.line);
        } else {
          val = toNumber(this.evaluate(stmt.args[0], scope), stmt.line);
          maxVal = toNumber(this.evaluate(stmt.args[1], scope), stmt.line);
        }
      } else if (stmt.args.length >= 3) {
        label = toText(this.evaluate(stmt.args[0], scope));
        val = toNumber(this.evaluate(stmt.args[1], scope), stmt.line);
        maxVal = toNumber(this.evaluate(stmt.args[2], scope), stmt.line);
      }
      node.label = label;
      node.progress = val;
      node.progressMax = maxVal;
    } else if (stmt.name === "avatar") {
      node.label = this.directiveText(stmt, scope, 0);
      node.avatarUrl = node.label;
      if (stmt.args[1]) {
        const sz = Math.round(toNumber(this.evaluate(stmt.args[1], scope), stmt.line));
        node.style.width = sz;
        node.style.height = sz;
      }
    } else if (stmt.name === "icon") {
      node.label = this.directiveText(stmt, scope);
    } else if (stmt.name === "link") {
      // `link "Docs", "https://…"`
      node.label = this.directiveText(stmt, scope, 0);
      node.value = this.directiveText(stmt, scope, 1) || node.label;
    } else if (stmt.name === "spacer") {
      // `spacer 24` is the height, not a label.
      if (stmt.args[0]) {
        node.style.height = Math.round(toNumber(this.evaluate(stmt.args[0], scope), stmt.line));
      }
    } else {
      node.label = stmt.args.length > 0
        ? stmt.args.map((a) => toText(this.evaluate(a, scope))).join(" ")
        : "";
    }

    const body = stmt.body ?? [];
    const elementTarget: BuildTarget = {
      out: CONTAINERS.has(stmt.name) ? node.children : null,
      node,
      style: node.style,
      window: null,
    };

    if (stmt.name === "button" || stmt.name === "link" || stmt.name === "toggle") {
      const explicitClick = body.find((s) => s.kind === "directive" && s.name === "click");
      const styleOnly = body.filter((s) => s.kind === "directive" && STYLE_DIRECTIVES.has(s.name));
      for (const styleStmt of styleOnly) this.execStatement(styleStmt, scope, elementTarget);

      // Everything that isn't styling or an explicit `click` block *is* the
      // click handler — that's the shorthand from the spec.
      const implicit = body.filter(
        (s) => !(s.kind === "directive" && (STYLE_DIRECTIVES.has(s.name) || s.name === "click"))
      );
      const handlerBody = explicitClick && explicitClick.kind === "directive" && explicitClick.body
        ? explicitClick.body
        : implicit;
      if (handlerBody.length > 0) node.onClick = { body: handlerBody, scope };
    } else {
      for (const inner of body) this.execStatement(inner, scope, elementTarget);
    }

    if (target.out) target.out.push(node);
  }

  /* ----------------------------------------------------------- expressions */

  private evaluate(expr: Expr, scope: Scope): BlakValue {
    this.tick(expr.line);

    switch (expr.kind) {
      case "number":
        return expr.value;
      case "string":
        return expr.value;
      case "bool":
        return expr.value;

      case "ident": {
        const found = lookup(scope, expr.name);
        if (!found) throw new BlakError(`"${expr.name}" hasn't been given a value yet`, expr.line);
        return found.scope.vars.get(expr.name)!;
      }

      case "unary": {
        const value = this.evaluate(expr.operand, scope);
        if (expr.op === "not") return !truthy(value);
        return -toNumber(value, expr.line);
      }

      case "binary":
        return this.binary(expr, scope);

      case "list":
        return list(expr.items.map((item) => this.evaluate(item, scope)));

      case "object": {
        const fields = new Map<string, BlakValue>();
        for (const entry of expr.entries) fields.set(entry.key, this.evaluate(entry.value, scope));
        return object(fields);
      }

      case "member": {
        const owner = this.evaluate(expr.object, scope);
        if (isObject(owner)) return owner.fields.get(expr.name) ?? null;
        if (isList(owner)) {
          if (expr.name === "length" || expr.name === "count") return owner.items.length;
          if (expr.name === "first") return owner.items[0] ?? null;
          if (expr.name === "last") return owner.items[owner.items.length - 1] ?? null;
        }
        if (typeof owner === "string" && (expr.name === "length" || expr.name === "count")) {
          return owner.length;
        }
        throw new BlakError(`"${expr.name}" isn't part of that value`, expr.line);
      }

      case "index": {
        const owner = this.evaluate(expr.object, scope);
        const index = this.evaluate(expr.index, scope);
        if (isList(owner)) return owner.items[Math.floor(toNumber(index, expr.line))] ?? null;
        if (isObject(owner)) return owner.fields.get(toText(index)) ?? null;
        if (typeof owner === "string") return owner[Math.floor(toNumber(index, expr.line))] ?? "";
        throw new BlakError("Only lists, data and text can be indexed", expr.line);
      }

      case "call": {
        const callee = this.evaluate(expr.callee, scope);
        const args = expr.args.map((a) => this.evaluate(a, scope));
        return this.callValue(callee, args, expr.line, NO_TARGET);
      }

      case "command": {
        const value = this.evaluate(expr.arg, scope);
        if (expr.name === "read") return this.host.readFile(toText(value));
        if (expr.name === "get") return this.host.fetchGet(toText(value));
        throw new BlakError(`Unknown command "${expr.name}"`, expr.line);
      }
    }
  }

  private binary(expr: Expr & { kind: "binary" }, scope: Scope): BlakValue {
    if (expr.op === "and") {
      const left = this.evaluate(expr.left, scope);
      return truthy(left) ? truthy(this.evaluate(expr.right, scope)) : false;
    }
    if (expr.op === "or") {
      const left = this.evaluate(expr.left, scope);
      return truthy(left) ? true : truthy(this.evaluate(expr.right, scope));
    }

    const left = this.evaluate(expr.left, scope);
    const right = this.evaluate(expr.right, scope);

    switch (expr.op) {
      case "+":
        if (typeof left === "string" || typeof right === "string") return toText(left) + toText(right);
        if (isList(left) && isList(right)) return list([...left.items, ...right.items]);
        return toNumber(left, expr.line) + toNumber(right, expr.line);
      case "-":
        return toNumber(left, expr.line) - toNumber(right, expr.line);
      case "*":
        return toNumber(left, expr.line) * toNumber(right, expr.line);
      case "/": {
        const divisor = toNumber(right, expr.line);
        if (divisor === 0) throw new BlakError("You can't divide by zero", expr.line);
        return toNumber(left, expr.line) / divisor;
      }
      case "%": {
        const divisor = toNumber(right, expr.line);
        if (divisor === 0) throw new BlakError("You can't divide by zero", expr.line);
        return toNumber(left, expr.line) % divisor;
      }
      case "==":
        return this.equals(left, right);
      case "!=":
        return !this.equals(left, right);
      case ">":
      case "<":
      case ">=":
      case "<=": {
        const comparable = typeof left === "number" && typeof right === "number";
        const a: number | string = comparable ? (left as number) : toText(left);
        const b: number | string = comparable ? (right as number) : toText(right);
        if (expr.op === ">") return a > b;
        if (expr.op === "<") return a < b;
        if (expr.op === ">=") return a >= b;
        return a <= b;
      }
      default:
        throw new BlakError(`Unknown operator "${expr.op}"`, expr.line);
    }
  }

  private equals(left: BlakValue, right: BlakValue): boolean {
    if (typeof left === "number" && typeof right === "number") return left === right;
    if (typeof left === "boolean" || typeof right === "boolean") return truthy(left) === truthy(right);
    if (left === null || right === null) return left === right;
    return toText(left) === toText(right);
  }

  private callValue(callee: BlakValue, args: BlakValue[], line: number, target: BuildTarget): BlakValue {
    if (isNative(callee)) return callee.call(args, line);
    if (!isFunction(callee)) throw new BlakError("That value isn't something you can call", line);

    const scope = childScope(callee.closure);
    callee.params.forEach((param, i) => scope.vars.set(param, args[i] ?? null));
    try {
      this.execBlock(callee.body, scope, target);
    } catch (err) {
      if (err instanceof ReturnSignal) return err.value;
      throw err;
    }
    return null;
  }
}
