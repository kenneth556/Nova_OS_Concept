import type { CSSProperties } from "react";
import { ExternalLink } from "lucide-react";
import { useFsStore } from "../store/fsStore";
import type { BlakRuntime } from "./interpreter";
import type { UiNode, UiStyle } from "./types";

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

const alignItems = (align?: UiStyle["align"]) =>
  align === "center" ? "center" : align === "right" ? "flex-end" : undefined;

const textAlign = (align?: UiStyle["align"]): CSSProperties["textAlign"] =>
  align === "center" ? "center" : align === "right" ? "right" : undefined;

const boxStyle = (node: UiNode): CSSProperties => ({
  width: node.style.width,
  height: node.style.height,
  borderRadius: node.style.rounded,
  gap: node.style.gap,
  padding: node.style.pad,
  alignItems: alignItems(node.style.align),
});

const textStyle = (node: UiNode, fallbackSize?: number): CSSProperties => ({
  width: node.style.width,
  height: node.style.height,
  fontSize: node.style.textSize ?? fallbackSize,
  color: resolveColor(node.style.color),
  fontWeight: node.style.bold ? 600 : undefined,
  textAlign: textAlign(node.style.align),
});

const BUTTON_VARIANTS: Record<string, string> = {
  primary: "bg-blue-500 hover:bg-blue-400 text-white shadow-sm shadow-blue-500/20",
  secondary: "bg-white/10 hover:bg-white/[0.16] text-white/90",
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
      return (
        <div className="flex flex-col gap-1 self-stretch" style={{ maxWidth: node.style.width }}>
          <label htmlFor={`blak-${node.id}`} className="text-[11px] uppercase tracking-wide text-white/35">
            {binding}
          </label>
          <input
            id={`blak-${node.id}`}
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

    case "image":
      return <BlakImage src={node.label} dataDir={dataDir} node={node} />;

    case "card":
      return (
        <div
          className="flex flex-col gap-2 p-3.5 rounded-xl bg-white/[0.045] border border-white/[0.08] transition hover:bg-white/[0.06] hover:border-white/[0.12]"
          style={{ ...boxStyle(node), borderRadius: node.style.rounded ?? 12, padding: node.style.pad ?? 14 }}
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
