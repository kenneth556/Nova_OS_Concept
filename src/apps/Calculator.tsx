import { useCalculatorStore } from "../store/calculatorStore";

const BTN = "rounded-xl text-lg font-medium h-14 flex items-center justify-center transition active:scale-95";

export default function Calculator() {
  const { display, setDisplay, stored, setStored, op, setOp, fresh, setFresh } = useCalculatorStore();

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
      case "+": return a + b;
      case "-": return a - b;
      case "x": return a * b;
      case "/": return b === 0 ? 0 : a / b;
      default: return b;
    }
  };

  const chooseOp = (operator: string) => {
    const current = parseFloat(display);
    if (stored !== null && op && !fresh) {
      const result = compute(stored, current, op);
      setStored(result);
      setDisplay(String(result));
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
    setDisplay(String(result));
    setStored(null);
    setOp(null);
    setFresh(true);
  };

  const clear = () => {
    setDisplay("0");
    setStored(null);
    setOp(null);
    setFresh(true);
  };

  const percent = () => setDisplay(String(parseFloat(display) / 100));
  const toggleSign = () => setDisplay(String(parseFloat(display) * -1));

  return (
    <div className="h-full flex flex-col bg-[#141420] text-white p-4 gap-3">
      <div className="flex-1 flex items-end justify-end px-2">
        <span className="text-5xl font-light tabular-nums truncate">{display}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button onClick={clear} className={`${BTN} bg-white/10 hover:bg-white/20`}>C</button>
        <button onClick={toggleSign} className={`${BTN} bg-white/10 hover:bg-white/20`}>+/-</button>
        <button onClick={percent} className={`${BTN} bg-white/10 hover:bg-white/20`}>%</button>
        <button onClick={() => chooseOp("/")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400`}>÷</button>

        {["7", "8", "9"].map((d) => (
          <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15`}>{d}</button>
        ))}
        <button onClick={() => chooseOp("x")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400`}>×</button>

        {["4", "5", "6"].map((d) => (
          <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15`}>{d}</button>
        ))}
        <button onClick={() => chooseOp("-")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400`}>−</button>

        {["1", "2", "3"].map((d) => (
          <button key={d} onClick={() => inputDigit(d)} className={`${BTN} bg-white/5 hover:bg-white/15`}>{d}</button>
        ))}
        <button onClick={() => chooseOp("+")} className={`${BTN} bg-indigo-500 hover:bg-indigo-400`}>+</button>

        <button onClick={() => inputDigit("0")} className={`${BTN} bg-white/5 hover:bg-white/15 col-span-2`}>0</button>
        <button onClick={() => inputDigit(".")} className={`${BTN} bg-white/5 hover:bg-white/15`}>.</button>
        <button onClick={equals} className={`${BTN} bg-indigo-600 hover:bg-indigo-500`}>=</button>
      </div>
    </div>
  );
}
