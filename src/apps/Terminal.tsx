import { useState, useRef, useEffect, useCallback } from "react";
import { useFsStore } from "../store/fsStore";

interface HistoryEntry {
  type: "input" | "output";
  text: string;
}

export default function Terminal() {
  const { nodes, currentPath, setCurrentPath, createFile, createDir, writeFile, deleteNode } = useFsStore();
  const [history, setHistory] = useState<HistoryEntry[]>([
    { type: "output", text: "\x1b[36mNovaOS Terminal\x1b[0m v0.2.0" },
    { type: "output", text: "Type \x1b[33mhelp\x1b[0m for available commands.\n" },
  ]);
  const [input, setInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const resolvePath = (target: string) => {
    if (!target) return currentPath;
    if (target.startsWith("/")) return target;
    if (target === "..") {
      if (currentPath === "/") return "/";
      const parts = currentPath.split("/").filter(Boolean);
      parts.pop();
      return "/" + parts.join("/");
    }
    if (target === ".") return currentPath;
    if (target === "~") return "/home/user";
    return currentPath === "/" ? `/${target}` : `${currentPath}/${target}`;
  };

  const nodeAt = (path: string) => nodes[path];

  const ls = (targetPath: string): string => {
    const node = nodeAt(targetPath);
    if (!node || node.type !== "dir" || !node.children) return `ls: cannot access '${targetPath}': No such file or directory`;
    if (node.children.length === 0) return "";
    return node.children.map((name) => {
      const childPath = targetPath === "/" ? `/${name}` : `${targetPath}/${name}`;
      const child = nodeAt(childPath);
      if (!child) return name;
      if (child.type === "dir") return `\x1b[34m${name}/\x1b[0m`;
      return name;
    }).join("  ");
  };

  const cat = (targetPath: string): string => {
    const node = nodeAt(targetPath);
    if (!node) return `cat: ${targetPath}: No such file or directory`;
    if (node.type === "dir") return `cat: ${targetPath}: Is a directory`;
    return node.content ?? "";
  };

  const wc = (targetPath: string): string => {
    const node = nodeAt(targetPath);
    if (!node) return `wc: ${targetPath}: No such file or directory`;
    if (node.type === "dir") return `wc: ${targetPath}: Is a directory`;
    const content = node.content ?? "";
    const lines = content.split("\n").length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    return `  ${lines}  ${words}  ${chars} ${targetPath}`;
  };

  const executeCommand = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setHistory((prev) => [...prev, { type: "input", text: `\x1b[32m${currentPath}\x1b[0m $ ${trimmed}` }]);
    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    const [command, ...args] = trimmed.split(" ").filter(Boolean);

    let output = "";

    switch (command) {
      case "help":
        output = [
          "Available commands:",
          "  ls [path]        list directory contents",
          "  cd <path>        change directory",
          "  pwd              print working directory",
          "  cat <file>       show file contents",
          "  touch <file>     create empty file",
          "  mkdir <dir>      create directory",
          "  rm <path>        remove file or empty directory",
          "  mv <src> <dst>   move/rename",
          "  cp <src> <dst>   copy file",
          "  echo <text>      print text",
          "  wc <file>        word/line/char count",
          "  clear            clear terminal",
          "  whoami           show current user",
          "  date             show current date",
          "  neofetch         system info",
        ].join("\n");
        break;
      case "clear":
        setHistory([]);
        return;
      case "pwd":
        output = currentPath;
        break;
      case "ls": {
        const target = args[0] ? resolvePath(args[0]) : currentPath;
        output = ls(target);
        break;
      }
      case "cd": {
        const target = args[0] || "/home/user";
        const newPath = resolvePath(target);
        if (nodes[newPath] && nodes[newPath].type === "dir") {
          setCurrentPath(newPath);
          output = "";
        } else {
          output = `cd: no such file or directory: ${target}`;
        }
        break;
      }
      case "cat": {
        if (!args[0]) { output = "cat: missing operand"; break; }
        output = cat(resolvePath(args[0]));
        break;
      }
      case "touch": {
        const target = args[0];
        if (!target) { output = "touch: missing operand"; break; }
        const newPath = resolvePath(target);
        if (!nodes[newPath]) createFile(newPath, "");
        output = "";
        break;
      }
      case "mkdir": {
        const target = args[0];
        if (!target) { output = "mkdir: missing operand"; break; }
        const newPath = resolvePath(target);
        if (nodes[newPath]) {
          output = `mkdir: cannot create directory '${target}': File exists`;
        } else {
          createDir(newPath);
          output = "";
        }
        break;
      }
      case "rm": {
        const target = args[0];
        if (!target) { output = "rm: missing operand"; break; }
        const rmPath = resolvePath(target);
        if (!nodes[rmPath]) { output = `rm: cannot remove '${target}': No such file or directory`; break; }
        deleteNode(rmPath);
        output = "";
        break;
      }
      case "mv": {
        const [src, dst] = args;
        if (!src || !dst) { output = "mv: missing operand"; break; }
        const srcPath = resolvePath(src);
        const dstPath = resolvePath(dst);
        if (!nodes[srcPath]) { output = `mv: cannot stat '${src}': No such file or directory`; break; }
        const srcNode = nodes[srcPath];
        writeFile(dstPath, srcNode.content ?? "");
        deleteNode(srcPath);
        output = "";
        break;
      }
      case "cp": {
        const [src, dst] = args;
        if (!src || !dst) { output = "cp: missing operand"; break; }
        const srcPath = resolvePath(src);
        const dstPath = resolvePath(dst);
        const srcNode = nodes[srcPath];
        if (!srcNode) { output = `cp: cannot stat '${src}': No such file or directory`; break; }
        if (srcNode.type === "dir") { output = `cp: -r not supported yet`; break; }
        writeFile(dstPath, srcNode.content ?? "");
        output = "";
        break;
      }
      case "echo":
        output = args.join(" ");
        break;
      case "wc": {
        if (!args[0]) { output = "wc: missing operand"; break; }
        output = wc(resolvePath(args[0]));
        break;
      }
      case "whoami":
        output = "user";
        break;
      case "date":
        output = new Date().toString();
        break;
      case "neofetch":
        output = [
          "        .--.       ",
          "       |o_o |      ",
          "       |:_/ |      ",
          "      //   \\ \\     ",
          "     (|     | )    ",
          "    /'\\_   _/`\\   ",
          "    \\___)=(___/    ",
          "",
          `\x1b[36muser\x1b[0m@\x1b[36mNovaOS\x1b[0m`,
          `───────────────`,
          `\x1b[33mOS:\x1b[0m NovaOS 0.1.0`,
          `\x1b[33mShell:\x1b[0m novash`,
          `\x1b[33mResolution:\x1b[0m ${window.innerWidth}x${window.innerHeight}`,
          `\x1b[33mTheme:\x1b[0m Dark`,
          `\x1b[33mTerminal:\x1b[0m NovaOS Terminal`,
          `\x1b[33mCPU:\x1b[0m ${navigator.hardwareConcurrency || 4} cores`,
        ].join("\n");
        break;
      default:
        output = `Command not found: ${command}. Type 'help' for a list.`;
    }

    if (output) {
      setHistory((prev) => [...prev, { type: "output", text: output }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, nodes, setCurrentPath, createFile, createDir, writeFile, deleteNode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeCommand(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(commandHistory[newIndex] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex] ?? "");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const lastCmd = input.trim().split(" ")[0];
      if (lastCmd === "cd" || lastCmd === "cat" || lastCmd === "touch" || lastCmd === "mkdir" || lastCmd === "rm" || lastCmd === "mv" || lastCmd === "cp" || lastCmd === "wc") {
        const partial = input.trim().split(" ").slice(1).join(" ") || "";
        const targetPath = resolvePath(partial);
        const node = nodeAt(targetPath);
        if (node && node.type === "dir") {
          const dirChildren = node.children ?? [];
          const matches = dirChildren.filter((c) => c.startsWith(partial.split("/").pop() ?? ""));
          if (matches.length === 1) {
            const prefix = input.trim().split(" ").slice(0, -1).join(" ") || lastCmd;
            setInput(`${prefix} ${matches[0]}`);
          }
        }
      }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setInput("");
      executeCommand("clear");
    }
  };

  const promptColor = "text-emerald-400";

  return (
    <div className="h-full flex flex-col bg-[#0c0c14] text-[#d4d4d4] font-mono text-[13px] p-4 overflow-hidden">
      <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-white/5">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        <span className="ml-2 text-[11px] text-white/30 uppercase tracking-wider">Terminal</span>
      </div>
      <div
        className="flex-1 overflow-y-auto font-mono text-[13px] leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {history.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap ${line.type === "input" ? "text-emerald-400" : "text-[#d4d4d4]"}`}>
            {line.text}
          </div>
        ))}
        <div className="flex items-center mt-1">
          <span className={`${promptColor} mr-2 shrink-0`}>{currentPath} $</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoFocus
            className="flex-1 bg-transparent outline-none border-none text-[#d4d4d4] caret-white"
          />
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
