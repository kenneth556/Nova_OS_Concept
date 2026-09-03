import { useState, useRef, useEffect } from "react";
import { useFsStore } from "../store/fsStore";

export default function Terminal() {
  const { nodes, currentPath, setCurrentPath, createFile, createDir } = useFsStore();
  const [history, setHistory] = useState<{ type: "input" | "output"; text: string }[]>([
    { type: "output", text: "NovaOS Terminal v0.1.0" },
    { type: "output", text: "Type 'help' for available commands." },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const resolvePath = (target: string) => {
    if (target.startsWith("/")) return target;
    if (target === "..") {
      if (currentPath === "/") return "/";
      const parts = currentPath.split("/").filter(Boolean);
      parts.pop();
      return "/" + parts.join("/");
    }
    if (target === ".") return currentPath;
    return currentPath === "/" ? `/${target}` : `${currentPath}/${target}`;
  };

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, { type: "input", text: `${currentPath} $ ${trimmed}` }]);
    const [command, ...args] = trimmed.split(" ");

    let output = "";

    switch (command) {
      case "help":
        output = "Available commands: help, clear, ls, cd, pwd, mkdir, touch, echo";
        break;
      case "clear":
        setHistory([]);
        return;
      case "pwd":
        output = currentPath;
        break;
      case "ls":
        const node = nodes[currentPath];
        if (node && node.type === "dir" && node.children) {
          output = node.children.join("  ");
        }
        break;
      case "cd": {
        const target = args[0] || "/home/user";
        const newPath = resolvePath(target);
        if (nodes[newPath] && nodes[newPath].type === "dir") {
          setCurrentPath(newPath);
        } else {
          output = `cd: no such file or directory: ${target}`;
        }
        break;
      }
      case "mkdir": {
        const target = args[0];
        if (!target) {
          output = "mkdir: missing operand";
        } else {
          const newPath = resolvePath(target);
          if (nodes[newPath]) {
            output = `mkdir: cannot create directory '${target}': File exists`;
          } else {
            createDir(newPath);
          }
        }
        break;
      }
      case "touch": {
        const target = args[0];
        if (!target) {
          output = "touch: missing operand";
        } else {
          const newPath = resolvePath(target);
          if (!nodes[newPath]) {
            createFile(newPath, "");
          }
        }
        break;
      }
      case "echo": {
        output = args.join(" ");
        break;
      }
      default:
        output = `Command not found: ${command}`;
    }

    if (output) {
      setHistory((prev) => [...prev, { type: "output", text: output }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(input);
      setInput("");
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm p-4 overflow-hidden selection:bg-white/20">
      <div className="flex-1 overflow-y-auto">
        {history.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap ${line.type === "input" ? "text-green-400" : ""}`}>
            {line.text}
          </div>
        ))}
        <div className="flex">
          <span className="text-green-400 mr-2">{currentPath} $</span>
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none border-none text-[#d4d4d4]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
