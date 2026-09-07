import { useEffect, useMemo, useState } from "react";
import {
  Cpu, MonitorSmartphone, HardDrive, Boxes, CircleCheck, CircleX, Copy, Clock, Layers, Info,
} from "lucide-react";
import {
  OS_NAME, OS_VERSION, OS_CHANNEL, SESSION_STARTED_AT, CREDITS,
  collectCapabilities, collectDeviceInfo, formatBytes, formatUptime, measureHeap, measureStorage,
  detectBrowser, detectPlatform,
} from "../../lib/about";
import type { StorageReport } from "../../lib/about";
import { useFsStore } from "../../store/fsStore";
import { useWindowStore } from "../../store/windowStore";
import { useBlakStore } from "../../store/blakStore";
import { useInstallStore } from "../../store/installStore";
import { APPS, BUNDLED_APPS, INSTALLABLE_APPS } from "../registry";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Cpu;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/35 mb-2.5">
        <Icon size={11} /> {title}
      </div>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value: string; unavailable?: boolean }[] }) {
  return (
    <div className="space-y-1.5 text-xs">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-white/40 shrink-0">{row.label}</span>
          <span
            className={`text-right truncate ${row.unavailable ? "text-white/25 italic" : ""}`}
            style={{ userSelect: "text" }}
            title={row.value}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AboutPanel() {
  const nodes = useFsStore((s) => s.nodes);
  const windows = useWindowStore((s) => s.windows);
  const desktops = useWindowStore((s) => s.desktops);
  const blakApps = useBlakStore((s) => s.apps);
  const installedNative = useInstallStore((s) => s.installed);

  const [storage, setStorage] = useState<StorageReport | null>(null);
  const [uptime, setUptime] = useState(() => Date.now() - SESSION_STARTED_AT);
  const [copied, setCopied] = useState(false);

  const device = useMemo(collectDeviceInfo, []);
  const capabilities = useMemo(collectCapabilities, []);
  const heap = measureHeap();

  useEffect(() => {
    void measureStorage().then(setStorage);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setUptime(Date.now() - SESSION_STARTED_AT), 1000);
    return () => clearInterval(id);
  }, []);

  const fsStats = useMemo(() => {
    let files = 0;
    let folders = 0;
    let contentBytes = 0;
    for (const node of Object.values(nodes)) {
      if (node.type === "dir") folders++;
      else {
        files++;
        contentBytes += (node.content?.length ?? 0) * 2;
      }
    }
    return { files, folders, contentBytes };
  }, [nodes]);

  const diagnostics = useMemo(() => {
    const lines = [
      `${OS_NAME} ${OS_VERSION} (${OS_CHANNEL})`,
      `Browser: ${detectBrowser()}`,
      `Platform: ${detectPlatform()}`,
      ...device.map((row) => `${row.label}: ${row.value}`),
      `Apps installed: ${installedNative.length} native, ${blakApps.length} BLAK`,
      `Filesystem: ${fsStats.files} files, ${fsStats.folders} folders`,
      storage?.supported
        ? `Origin storage: ${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`
        : "Origin storage: not reported",
      `NovaOS data: ${storage ? formatBytes(storage.novaBytes) : "measuring"}`,
      `Session uptime: ${formatUptime(uptime)}`,
      ...capabilities.map((c) => `${c.label}: ${c.supported ? "supported" : "unavailable"}`),
    ];
    return lines.join("\n");
  }, [device, capabilities, installedNative, blakApps, fsStats, storage, uptime]);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">About</h2>
      <p className="text-white/40 text-xs mb-5">
        Everything on this page is measured from the running system. Anything your browser refuses to
        report is marked rather than estimated.
      </p>

      {/* identity */}
      <div className="relative overflow-hidden bg-white/5 rounded-xl p-5 mb-3">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-blue-500 opacity-[0.14] blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center shrink-0 shadow-lg shadow-black/25">
            <span className="text-2xl font-semibold">N</span>
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold tracking-tight">
              {OS_NAME} {OS_VERSION}
            </div>
            <div className="text-[11px] text-white/45">
              {OS_CHANNEL} · running in {import.meta.env.DEV ? "development" : "production"} mode
            </div>
            <div className="text-[11px] text-white/35 mt-1.5" style={{ userSelect: "text" }}>
              A desktop operating system that runs entirely in a browser tab. No server, no install —
              your files, settings and apps live in this browser's storage.
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Section icon={Boxes} title="Apps">
          <Rows
            rows={[
              { label: "Bundled", value: `${BUNDLED_APPS.length} apps` },
              {
                label: "Downloadable",
                value: `${installedNative.length} of ${INSTALLABLE_APPS.length} installed`,
              },
              { label: "BLAK apps", value: `${blakApps.length} installed` },
              { label: "Total known", value: `${APPS.length + blakApps.length}` },
            ]}
          />
        </Section>

        <Section icon={Layers} title="Session">
          <Rows
            rows={[
              { label: "Uptime", value: formatUptime(uptime) },
              { label: "Open windows", value: String(windows.length) },
              { label: "Virtual desktops", value: String(desktops.length) },
              {
                label: "Started",
                value: new Date(SESSION_STARTED_AT).toLocaleTimeString(),
              },
            ]}
          />
        </Section>
      </div>

      <Section icon={MonitorSmartphone} title="Device and display">
        <Rows rows={device} />
      </Section>

      <div className="h-3" />

      <Section icon={HardDrive} title="Storage">
        <Rows
          rows={[
            storage?.supported
              ? {
                  label: "Used by this origin",
                  value: `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`,
                }
              : { label: "Used by this origin", value: "Not reported", unavailable: true },
            {
              label: "NovaOS data",
              value: storage
                ? `${formatBytes(storage.novaBytes)} across ${storage.novaKeys} keys`
                : "Measuring…",
            },
            {
              label: "Virtual filesystem",
              value: `${fsStats.files} files, ${fsStats.folders} folders, ${formatBytes(fsStats.contentBytes)}`,
            },
            heap
              ? {
                  label: "JavaScript heap",
                  value: `${formatBytes(heap.used)}${heap.limit ? ` of ${formatBytes(heap.limit)}` : ""}`,
                }
              : { label: "JavaScript heap", value: "Not reported", unavailable: true },
          ]}
        />
        {storage?.supported && storage.quota > 0 && (
          <div className="mt-3">
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${Math.min(100, (storage.usage / storage.quota) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-white/30 mt-1">
              {((storage.usage / storage.quota) * 100).toFixed(1)}% of the space this browser grants
              the page
            </div>
          </div>
        )}
      </Section>

      <div className="h-3" />

      <Section icon={Cpu} title="Browser capabilities">
        <div className="space-y-1.5">
          {capabilities.map((capability) => (
            <div key={capability.label} className="flex items-start gap-2 text-xs">
              {capability.supported ? (
                <CircleCheck size={13} className="text-emerald-400 mt-0.5 shrink-0" />
              ) : (
                <CircleX size={13} className="text-white/25 mt-0.5 shrink-0" />
              )}
              <span className={capability.supported ? "text-white/70" : "text-white/35"}>
                {capability.label}
                <span className="text-white/30"> — {capability.note}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>

      <div className="h-3" />

      <Section icon={Info} title="Built with">
        <Rows rows={CREDITS} />
      </Section>

      <div className="flex items-center gap-2 mt-4 mb-2">
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(diagnostics).then(() => setCopied(true));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] bg-white/5 hover:bg-white/10 text-white/70"
        >
          {copied ? <CircleCheck size={12} className="text-emerald-400" /> : <Copy size={12} />}
          {copied ? "Copied to clipboard" : "Copy system report"}
        </button>
        <span className="text-[10px] text-white/25 flex items-center gap-1">
          <Clock size={10} /> Live values refresh every second
        </span>
      </div>
    </div>
  );
}
