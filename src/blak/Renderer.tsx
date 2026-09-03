import type { CSSProperties } from "react";
import { useFsStore } from "../store/fsStore";
import type { BlakRuntime } from "./interpreter";
import type { UiNode } from "./types";

interface Props {
  nodes: UiNode[];
  runtime: BlakRuntime;
  /** Used to resolve relative `image "logo.png"` paths. */
  dataDir: string;
}

const styleOf = (node: UiNode): CSSProperties => ({
  width: node.style.width,
  height: node.style.height,
  fontSize: node.style.textSize,
  borderRadius: node.style.rounded,
});

function BlakImage({ src, dataDir, node }: { src: string; dataDir: string; node: UiNode }) {
  const nodes = useFsStore((s) => s.nodes);
  const isRemote = /^(https?:|data:)/.test(src);
  const path = src.startsWith("/") ? src : `${dataDir}/${src}`;
  const content = isRemote ? src : nodes[path]?.content ?? "";
  const usable = /^(https?:|data:)/.test(content);

  if (!usable) {
    return (
      <div
        className="flex items-center justify-center bg-white/5 border border-dashed border-white/15 text-[11px] text-white/35 rounded"
        style={{ width: node.style.width ?? 120, height: node.style.height ?? 90 }}
      >
        {src || "image"}
      </div>
    );
  }
  return <img src={content} alt={src} className="object-contain" style={styleOf(node)} />;
}

function BlakNodeView({ node, runtime, dataDir }: { node: UiNode; runtime: BlakRuntime; dataDir: string }) {
  const children = (
    <>
      {node.children.map((child) => (
        <BlakNodeView key={child.id} node={child} runtime={runtime} dataDir={dataDir} />
      ))}
    </>
  );

  switch (node.type) {
    case "text":
      return (
        <div className="text-sm text-white/85 whitespace-pre-wrap" style={styleOf(node)}>
          {node.label}
        </div>
      );

    case "button":
      return (
        <button
          onClick={() => {
            if (node.onClick) runtime.invoke(node.onClick.body, node.onClick.scope);
          }}
          className="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium self-start disabled:opacity-50"
          style={styleOf(node)}
        >
          {node.label || "Button"}
        </button>
      );

    case "input": {
      const binding = node.binding ?? node.id;
      return (
        <input
          value={runtime.inputs.get(binding) ?? ""}
          onChange={(e) => runtime.setInput(binding, e.target.value)}
          placeholder={node.label || binding}
          aria-label={binding}
          className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500/60 self-start"
          style={{ ...styleOf(node), userSelect: "text" }}
        />
      );
    }

    case "image":
      return <BlakImage src={node.label} dataDir={dataDir} node={node} />;

    case "card":
      return (
        <div
          className="flex flex-col gap-2 p-3 rounded-lg bg-white/5 border border-white/10"
          style={styleOf(node)}
        >
          {children}
        </div>
      );

    case "box":
      return (
        <div className="flex flex-col gap-2 p-2" style={styleOf(node)}>
          {children}
        </div>
      );

    case "row":
      return (
        <div className="flex flex-row items-center gap-2 flex-wrap" style={styleOf(node)}>
          {children}
        </div>
      );

    case "column":
    default:
      return (
        <div className="flex flex-col gap-2" style={styleOf(node)}>
          {children}
        </div>
      );
  }
}

/** Renders a BLAK UI tree. */
export default function BlakUi({ nodes, runtime, dataDir }: Props) {
  return (
    <div className="flex flex-col gap-2.5">
      {nodes.map((node) => (
        <BlakNodeView key={node.id} node={node} runtime={runtime} dataDir={dataDir} />
      ))}
    </div>
  );
}
