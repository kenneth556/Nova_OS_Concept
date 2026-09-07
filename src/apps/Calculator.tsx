import { useState } from "react";
import { History, Trash2, FlaskConical } from "lucide-react";
import { useCalculatorStore } from "../store/calculatorStore";

const BTN =
  "rounded-xl text-sm font-medium h-11 flex items-center justify-center transition active:scale-95 select-none";

const SCI_FUNCS: Record<string, (x: number) => number> = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  log: (x) => Math.log10(x),
  ln: (x) => Math.log(x),
  sqrt: (x) => Math.sqrt(x),
};

function formatResult(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e12) / 1e12;
  const str = String(rounded);
  return str.length > 14 ? rounded.toExponential(6) : str;
}

export default function Calculator() {
  const {
    display,
    stored,
    op,
    fresh,
    scientific,
    history,
    setDisplay,
    setStored,
    setOp,
    setFresh,
    toggleScientific,
    addHistory,
    clearHistory,
  } = useCalculatorStore();

  const [historyOpen, setHistoryOpen] = useState(false);

  const inputDigit = (d: string) => {
    if (fresh) {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
    } else {
      if (d === "." && display.includes(".")) return;
      setDisplay(display === "0" && d !== "." ? d : display + d);
    }
  };

  const compute = (a: number, b: number, operator: string) => {
    switch (operator) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "×":
        return a * b;
      case "÷":
        return b === 0 ? NaN : a / b;
      case "pow":
        return Math.pow(a, b);
      default:
        return b;
    }
  };

  const chooseOp = (operator: string) => {
    const current = parseFloat(display);
    if (stored !== null && op && !fresh) {
      const result = compute(stored, current, op);
      const formatted = formatResult(result);
      setDisplay(formatted);
      setStored(parseFloat(formatted));
    } else {
      setStored(current);
    }
    setOp(operator);
    setFresh(true);
  };

  const equals = () => {
    if (stored === null || !op) return;
    const current = parseFloat(display);
    const result = compute(stored, current, op);
    const expr = `${formatResult(stored)} ${op} ${formatResult(current)}`;
    const formatted = formatResult(result);
    addHistory(expr, formatted);
    setDisplay(formatted);
    setStored(null);
    setOp(null);
    setFresh(true);
  };

  const applySci = (name: string) => {
    const current = parseFloat(display);
    const fn = SCI_FUNCS[name];
    if (fn) {
      const result = fn(current);
      const formatted = formatResult(result);
      addHistory(`${name}(${formatResult(current)})`, formatted);
      setDisplay(formatted);
      setFresh(true);
    }
  };

  const clear = () => {
    setDisplay("0");
    setStored(null);
    setOp(null);
    setFresh(true);
  };

  const percent = () => setDisplay(formatResult(parseFloat(display) / 100));
  const toggleSign = () => setDisplay(formatResult(parseFloat(display) * -1));

  const sciButtons = [
    { label: "sin", action: () => applySci("sin") },
    { label: "cos", action: () => applySci("cos") },
    { label: "tan", action: () => applySci("tan") },
    { label: "log", action: () => applySci("log") },
    { label: "ln", action: () => applySci("ln") },
    { label: "√", action: () => applySci("sqrt") },
    { label: "π", action: () => setDisplay(formatResult(Math.PI)) },
    { label: "e", action: () => setDisplay(formatResult(Math.E)) },
  ];

  return (
    <div className="h-full flex bg-[#0f0f1a] text-white">
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-xs text-white/40 uppercase tracking-wider">Calculator</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              className={`p-2 rounded-lg transition ${historyOpen ? "bg-white/15 text-white" : "hover:bg-white/10 text-white/50"}`}
              title="History"
            >
              <History size={16} />
            </button>
            <button
              onClick={toggleScientific}
              className={`p-2 rounded-lg transition ${scientific ? "bg-indigo-500/30 text-indigo-300" : "hover:bg-white/10 text-white/50"}`}
              title="Scientific mode"
            >
              <FlaskConical size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-end justify-end px-2">
          <div className="text-right">
            {op && stored !== null && (
              <div className="text-xs text-white/35 mb-1">
                {formatResult(stored)} {op}
              </div>
            )}
            <span className="text-5xl font-extralight tabular-nums truncate block">{display}</span>
          </div>
        </div>

        <div className={`grid gap-2 ${scientific ? "grid-cols-5" : "grid-cols-4"}`}>
          {scientific &&
            sciButtons.map((btn) => (
              <button key={btn.label} onClick={btn.action} className={`${BTN} bg-white/5 hover:bg-white/15 text-indigo-200`}>
                {btn.label}
              </button>
            ))}

          <button onClick={clear} className={`${BTN} bg-white/10 hover:bg-white/20 text-white`}>
            C
          </button>
          <button onClick={toggleSign} className={`${BTN} bg-white/10 hover:bg-white/20 text-white`}>
            +/−
          </button>
          <button onClick={percent} className={`${BTN} bg-white/10 hover:bg-white/20 text-white`}>
            %
          </button>
          <button onClick={() => chooseOp("÷")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400 text-white`}>
            ÷
          </button>

          {["7", "8", "9"].map((d) => (
            <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15 text-white`}>
              {d}
            </button>
          ))}
          <button onClick={() => chooseOp("×")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400 text-white`}>
            ×
          </button>

          {["4", "5", "6"].map((d) => (
            <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15 text-white`}>
              {d}
            </button>
          ))}
          <button onClick={() => chooseOp("-")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400 text-white`}>
            −
          </button>

          {["1", "2", "3"].map((d) => (
            <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15 text-white`}>
              {d}
            </button>
          ))}
          <button onClick={() => chooseOp("+")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400 text-white`}>
            +
          </button>

          <button onClick={() => inputDigit("0")} className={`${BTN} bg-white/5 hover:bg-white/15 text-white col-span-2`}>
            0
          </button>
          <button onClick={() => inputDigit(".")} className={`${BTN} bg-white/5 hover:bg-white/15 text-white`}>
            .
          </button>
          <button onClick={equals} className={`${BTN} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            =
          </button>
        </div>
      </div>

      {historyOpen && (
        <div className="w-64 border-l border-white/10 bg-black/20 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-xs uppercase tracking-wider text-white/40">History</span>
            <button onClick={clearHistory} className="text-white/30 hover:text-red-300" title="Clear history">
              <Trash2 size={14} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {history.length === 0 ? (
              <div className="text-xs text-white/25 text-center py-8">No calculations yet</div>
            ) : (
              history.map((entry, i) => (
                <div key={i} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <div className="text-[11px] text-white/40 truncate">{entry.expr}</div>
                  <div className="text-sm text-white/80 tabular-nums mt-0.5">= {entry.result}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
