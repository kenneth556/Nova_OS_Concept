import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { useFsStore } from "../store/fsStore";
import type { BlakRuntime } from "./interpreter";
import type { UiNode, UiStyle } from "./types";
import { toText, toNumber } from "./interpreter";

interface Props {
  nodes: UiNode[];
  runtime: BlakRuntime;
  /** Used to resolve relative `image "logo.png"` paths. */
  dataDir: string;
  /** `link` and `browser` both hand off to the OS. */
  onOpenUrl?: (url: string) => void;
}

/**
 * `color accent` reads better than a hex code, so named colours resolve here.
 * The accent follows the OS accent setting.
 */
const NAMED_COLORS: Record<string, string> = {
  accent: "var(--nova-accent)",
  muted: "rgba(255,255,255,0.45)",
  dim: "rgba(255,255,255,0.62)",
  white: "rgba(255,255,255,0.92)",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  purple: "#c084fc",
  pink: "#f472b6",
};

const resolveColor = (value?: string): string | undefined => {
  if (!value) return undefined;
  return NAMED_COLORS[value.toLowerCase()] ?? value;
};

const resolveShadow = (shadow?: string | boolean): string | undefined => {
  if (!shadow) return undefined;
  if (shadow === true || shadow === "md") return "0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)";
  if (shadow === "sm") return "0 1px 3px 0 rgba(0, 0, 0, 0.2), 0 1px 2px -1px rgba(0, 0, 0, 0.2)";
  if (shadow === "lg") return "0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)";
  if (shadow === "xl") return "0 25px 50px -12px rgba(0, 0, 0, 0.5)";
  if (shadow === "none") return "none";
  return shadow;
};

const alignItems = (align?: UiStyle["align"]) =>
  align === "center" ? "center" : align === "right" ? "flex-end" : undefined;

const textAlign = (align?: UiStyle["align"]): CSSProperties["textAlign"] =>
  align === "center" ? "center" : align === "right" ? "right" : undefined;

const boxStyle = (node: UiNode): CSSProperties => ({
  width: node.style.width,
  height: node.style.height,
  minWidth: node.style.minWidth,
  maxWidth: node.style.maxWidth,
  minHeight: node.style.minHeight,
  maxHeight: node.style.maxHeight,
  borderRadius: node.style.rounded,
  gap: node.style.gap,
  padding: node.style.pad,
  alignItems: alignItems(node.style.align),
  boxShadow: resolveShadow(node.style.shadow),
  border: node.style.border,
  opacity: node.style.opacity,
  backdropFilter: node.style.blur
    ? `blur(${typeof node.style.blur === "number" ? node.style.blur + "px" : node.style.blur})`
    : undefined,
  WebkitBackdropFilter: node.style.blur
    ? `blur(${typeof node.style.blur === "number" ? node.style.blur + "px" : node.style.blur})`
    : undefined,
  background: resolveColor(node.style.bg) ?? resolveColor(node.style.background),
  overflow: (node.style.overflow as CSSProperties["overflow"]) ?? undefined,
});

const textStyle = (node: UiNode, fallbackSize?: number): CSSProperties => ({
  width: node.style.width,
  height: node.style.height,
  fontSize: node.style.textSize ?? fallbackSize,
  color: resolveColor(node.style.color),
  fontWeight: node.style.bold ? 600 : undefined,
  textAlign: textAlign(node.style.align),
  opacity: node.style.opacity,
});

const BUTTON_VARIANTS: Record<string, string> = {
  primary: "bg-blue-500 hover:bg-blue-400 text-white shadow-sm shadow-blue-500/20",
  secondary: "bg-white/10 hover:bg-white/[0.16] text-white/90 border border-white/5",
  ghost: "bg-transparent hover:bg-white/10 text-white/70 hover:text-white",
  danger: "bg-red-500/90 hover:bg-red-500 text-white",
};

function BlakImage({ src, dataDir, node }: { src: string; dataDir: string; node: UiNode }) {
  const nodes = useFsStore((s) => s.nodes);
  const isRemote = /^(https?:|data:)/.test(src);
  const path = src.startsWith("/") ? src : `${dataDir}/${src}`;
  const content = isRemote ? src : nodes[path]?.content ?? "";
  const usable = /^(https?:|data:)/.test(content);

  if (!usable) {
    return (
      <div
        className="flex items-center justify-center bg-gradient-to-br from-white/[0.07] to-white/[0.03] border border-dashed border-white/10 text-[11px] text-white/30 rounded-xl"
        style={{ width: node.style.width ?? 140, height: node.style.height ?? 100 }}
      >
        {src || "image"}
      </div>
    );
  }
  return (
    <img
      src={content}
      alt={src}
      className="object-cover rounded-xl border border-white/10"
      style={{
        width: node.style.width,
        height: node.style.height,
        borderRadius: node.style.rounded ?? 12,
      }}
    />
  );
}

interface NodeProps {
  node: UiNode;
  runtime: BlakRuntime;
  dataDir: string;
  onOpenUrl?: (url: string) => void;
}

function BlakNodeView({ node, runtime, dataDir, onOpenUrl }: NodeProps) {
  if (node.style.hidden) return null;

  const children = (
    <>
      {node.children.map((child) => (
        <BlakNodeView
          key={child.id}
          node={child}
          runtime={runtime}
          dataDir={dataDir}
          onOpenUrl={onOpenUrl}
        />
      ))}
    </>
  );

  switch (node.type) {
    case "heading":
      return (
        <div
          className="text-[19px] font-semibold tracking-tight text-white leading-snug"
          style={{ ...textStyle(node), userSelect: "text" }}
        >
          {node.label}
        </div>
      );

    case "subtitle":
      return (
        <div
          className="text-[12.5px] text-white/45 leading-relaxed"
          style={{ ...textStyle(node), userSelect: "text" }}
        >
          {node.label}
        </div>
      );

    case "badge":
      return (
        <span
          className="self-start inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-white/75 border border-white/10"
          style={{
            color: resolveColor(node.style.color),
            borderColor: node.style.color ? `${resolveColor(node.style.color)}33` : undefined,
            backgroundColor: node.style.color ? `${resolveColor(node.style.color)}1f` : undefined,
            fontSize: node.style.textSize,
          }}
        >
          {node.label}
        </span>
      );

    case "divider":
      return <div className="h-px w-full bg-white/10 my-1" style={{ width: node.style.width }} />;

    case "spacer":
      return <div style={{ height: node.style.height ?? node.style.textSize ?? 12 }} />;

    case "link":
      return (
        <button
          onClick={() => {
            if (node.onClick) runtime.invoke(node.onClick.body, node.onClick.scope);
            else if (node.value && onOpenUrl) onOpenUrl(node.value);
          }}
          className="self-start inline-flex items-center gap-1 text-[13px] text-blue-300 hover:underline"
          style={textStyle(node)}
        >
          {node.label}
          <ExternalLink size={11} />
        </button>
      );

    case "text":
      return (
        <div
          className="text-[13.5px] text-white/80 leading-relaxed whitespace-pre-wrap"
          style={{ ...textStyle(node), userSelect: "text" }}
        >
          {node.label}
        </div>
      );

    case "button": {
      const variant = node.style.variant ?? "primary";
      return (
        <button
          onClick={() => {
            if (node.onClick) runtime.invoke(node.onClick.body, node.onClick.scope);
          }}
          className={`self-start px-3.5 py-2 rounded-lg text-[13px] font-medium transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500/50 outline-none ${
            BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS.primary
          }`}
          style={{
            width: node.style.width,
            height: node.style.height,
            fontSize: node.style.textSize,
            borderRadius: node.style.rounded,
          }}
        >
          {node.label || "Button"}
        </button>
      );
    }

    case "input": {
      const binding = node.binding ?? node.id;
      const inputType = node.style.inputType || "text";
      return (
        <div className="flex flex-col gap-1 self-stretch" style={{ maxWidth: node.style.width }}>
          <label htmlFor={`blak-${node.id}`} className="text-[11px] uppercase tracking-wide text-white/35">
            {binding}
          </label>
          <input
            id={`blak-${node.id}`}
            type={inputType}
            value={runtime.inputs.get(binding) ?? ""}
            onChange={(e) => runtime.setInput(binding, e.target.value)}
            placeholder={node.value || `Enter ${binding}`}
            className="bg-black/25 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 placeholder:text-white/25"
            style={{
              width: node.style.width,
              height: node.style.height,
              fontSize: node.style.textSize,
              userSelect: "text",
            }}
          />
        </div>
      );
    }

    case "select": {
      const binding = node.binding ?? node.id;
      const options = node.selectOptions ?? ["Option 1", "Option 2"];
      return (
        <div className="flex flex-col gap-1 self-stretch" style={{ maxWidth: node.style.width }}>
          <label htmlFor={`blak-${node.id}`} className="text-[11px] uppercase tracking-wide text-white/35">
            {binding}
          </label>
          <select
            id={`blak-${node.id}`}
            value={runtime.inputs.get(binding) ?? options[0]}
            onChange={(e) => runtime.setInput(binding, e.target.value)}
            className="bg-black/25 border border-white/10 rounded-lg px-3 py-2 text-[13px] outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20 text-white"
            style={{
              width: node.style.width,
              height: node.style.height,
              fontSize: node.style.textSize,
            }}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );
    }

    case "chart": {
      const chartData = node.chartData;
      const chartType = node.style.chartType || "bar";
      let entries: { label: string; value: number }[] = [];
      if (chartData && (chartData as any).type === "list") {
        const items = (chartData as any).items;
        if (items.length > 0 && typeof items[0] === "object" && (items[0] as any).type === "object") {
          entries = items.map((item: any) => ({
            label: toText(item.fields.get("label") ?? item.fields.get("category") ?? "?"),
            value: toNumber(item.fields.get("value") ?? item.fields.get("amount") ?? 0, 0),
          }));
        } else if (items.length > 0 && typeof items[0] === "number") {
          entries = items.map((val: number, idx: number) => ({ label: String(idx + 1), value: val }));
        }
      }
      const maxVal = entries.length > 0 ? Math.max(...entries.map((e) => e.value)) : 1;
      const barColors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-purple-500", "bg-teal-500", "bg-orange-500"];

      if (chartType === "bar") {
        return (
          <div className="flex flex-col gap-2 self-stretch">
            {entries.map((entry, idx) => (
              <div key={entry.label} className="flex items-center gap-2">
                <div className="w-16 text-[11px] text-white/60 truncate">{entry.label}</div>
                <div className="flex-1 h-5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColors[idx % barColors.length]}`}
                    style={{ width: `${Math.max((entry.value / maxVal) * 100, 2)}%` }}
                  />
                </div>
                <div className="w-16 text-right text-[11px] text-white/80 tabular-nums">
                  {entry.value.toLocaleString()}
                </div>
              </div>
            ))}
            {entries.length === 0 && (
              <div className="text-xs text-white/30 py-3 text-center">No data to chart</div>
            )}
          </div>
        );
      }

      return (
        <div className="text-xs text-white/40 py-2">
          Chart type "{chartType}" is not supported yet.
        </div>
      );
    }

    case "toggle": {
      const binding = node.binding;
      const isChecked = Boolean(
        node.checked || (binding && (runtime.inputs.get(binding) === "true" || Boolean(runtime.globals.vars.get(binding))))
      );
      const handleToggle = () => {
        if (binding) {
          runtime.toggleInput(binding);
        }
        if (node.onClick) {
          runtime.invoke(node.onClick.body, node.onClick.scope);
        }
      };
      return (
        <button
          type="button"
          onClick={handleToggle}
          className="group flex items-center justify-between gap-3 text-left py-1.5 px-2.5 rounded-lg transition hover:bg-white/[0.05] outline-none cursor-pointer border border-transparent hover:border-white/5"
          style={{ width: node.style.width, maxWidth: "100%" }}
        >
          {node.label && (
            <span className="text-[13px] text-white/85 group-hover:text-white font-medium select-none">
              {node.label}
            </span>
          )}
          <div
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              isChecked ? "bg-blue-500 shadow-sm shadow-blue-500/40" : "bg-white/20 hover:bg-white/25"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isChecked ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </div>
        </button>
      );
    }

    case "progress": {
      const val = Math.max(0, node.progress ?? 0);
      const max = Math.max(1, node.progressMax ?? 100);
      const percent = Math.min(100, Math.round((val / max) * 100));
      const customColor = resolveColor(node.style.color);
      return (
        <div className="flex flex-col gap-1.5 self-stretch" style={{ width: node.style.width }}>
          {node.label && (
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-white/70 font-medium">{node.label}</span>
              <span className="text-white/45 tabular-nums font-semibold">{percent}%</span>
            </div>
          )}
          <div
            className="h-2 w-full bg-white/10 rounded-full overflow-hidden p-0.5 border border-white/5"
            style={{ height: node.style.height ?? 8, borderRadius: node.style.rounded ?? 9999 }}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                customColor ? "" : "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500"
              }`}
              style={{
                width: `${percent}%`,
                backgroundColor: customColor,
                boxShadow: percent > 0 ? "0 0 10px rgba(59, 130, 246, 0.4)" : undefined,
              }}
            />
          </div>
        </div>
      );
    }

    case "avatar": {
      const size = node.style.width ?? node.style.height ?? 38;
      const src = node.avatarUrl ?? node.label;
      const isUrl = /^(https?:|data:|\/)/.test(src);
      const initials = src.length <= 4 ? src : src.substring(0, 2).toUpperCase();
      if (isUrl) {
        return (
          <img
            src={src}
            alt={node.label}
            className="rounded-full object-cover border border-white/15 shadow-sm shrink-0"
            style={{
              width: size,
              height: size,
              borderRadius: node.style.rounded ?? "9999px",
            }}
          />
        );
      }
      return (
        <div
          className="rounded-full flex items-center justify-center font-semibold text-white shadow-inner bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-500 border border-white/20 select-none shrink-0"
          style={{
            width: size,
            height: size,
            fontSize: Math.max(11, Math.floor(size * 0.38)),
            borderRadius: node.style.rounded ?? "9999px",
          }}
        >
          {initials}
        </div>
      );
    }

    case "icon":
      return (
        <div
          className="text-2xl flex items-center justify-center"
          style={{ width: node.style.width, height: node.style.height }}
        >
          {node.label}
        </div>
      );

    case "image":
      return <BlakImage src={node.label} dataDir={dataDir} node={node} />;

    case "card":
      return (
        <div
          className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.045] backdrop-blur-md border border-white/[0.08] transition duration-150 hover:bg-white/[0.06] hover:border-white/[0.12]"
          style={{ ...boxStyle(node), borderRadius: node.style.rounded ?? 12, padding: node.style.pad ?? 14 }}
        >
          {children}
        </div>
      );

    case "scrollbox":
      return (
        <div
          className="flex flex-col overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20"
          style={{
            ...boxStyle(node),
            maxHeight: node.style.maxHeight ?? node.style.height ?? 340,
            gap: node.style.gap ?? 8,
          }}
        >
          {children}
        </div>
      );

    case "box":
      return (
        <div className="flex flex-col gap-2" style={boxStyle(node)}>
          {children}
        </div>
      );

    case "row":
      return (
        <div
          className="flex flex-row items-center flex-wrap"
          style={{ ...boxStyle(node), gap: node.style.gap ?? 10, alignItems: alignItems(node.style.align) ?? "center" }}
        >
          {children}
        </div>
      );

    case "column":
    default:
      return (
        <div className="flex flex-col" style={{ ...boxStyle(node), gap: node.style.gap ?? 10 }}>
          {children}
        </div>
      );
  }
}

/** Renders a BLAK UI tree. */
export default function BlakUi({ nodes, runtime, dataDir, onOpenUrl }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {nodes.map((node) => (
        <BlakNodeView
          key={node.id}
          node={node}
          runtime={runtime}
          dataDir={dataDir}
          onOpenUrl={onOpenUrl}
        />
      ))}
    </div>
  );
}
