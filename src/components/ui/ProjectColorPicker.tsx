"use client";

import { Pipette, Palette, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

function normalizeHex(value: string) {
  const next = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(next) ? `#${next.toLowerCase()}` : null;
}
function channels(hex: string) {
  const value = normalizeHex(hex) ?? "#3276ff";
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}
function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue].map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}
function rgbToHsv(red: number, green: number, blue: number) {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return [hue, max ? delta / max : 0, max] as const;
}
function hsvToHex(hue: number, saturation: number, brightness: number) {
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = brightness - chroma;
  const [r, g, b] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return toHex((r + match) * 255, (g + match) * 255, (b + match) * 255);
}

export function ProjectColorPicker({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "#3276ff");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const [red, green, blue] = channels(draft);
  const [hue, saturation, brightness] = rgbToHsv(red, green, blue);
  useEffect(() => setDraft(value || "#3276ff"), [value]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  function commit(color: string) { setDraft(color); onChange(color); }
  function chooseSaturation(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    commit(hsvToHex(hue, Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height))));
  }
  async function pickFromScreen() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const color = normalizeHex((await new EyeDropper().open()).sRGBHex);
      if (color) commit(color);
    } catch { /* cancelled */ }
  }
  return (
    <div className="project-color-picker" ref={root}>
      <button type="button" className={`project-color-trigger ${open ? "active" : ""}`} style={{ background: value || "var(--background)" }} aria-label={label} aria-expanded={open} onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 16);
        const estimatedHeight = 390;
        setPosition({
          left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)),
          top: window.innerHeight - rect.bottom >= estimatedHeight
            ? rect.bottom + 8
            : Math.max(8, rect.top - estimatedHeight - 8),
        });
        setOpen((current) => !current);
      }}><Palette /></button>
      {open && typeof document !== "undefined" ? createPortal(
        <div ref={popover} className="project-color-popover" role="dialog" aria-label={label} style={position}>
          <div className="project-color-head"><strong>{label}</strong><button type="button" onClick={() => setOpen(false)} aria-label="Close"><X /></button></div>
          <div className="project-color-area" style={{ backgroundColor: `hsl(${hue} 100% 50%)` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); chooseSaturation(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) chooseSaturation(event); }} onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}>
            <span className="project-color-cursor" style={{ left: `${saturation * 100}%`, top: `${(1 - brightness) * 100}%` }} />
          </div>
          <div className="project-color-tools">
            <button type="button" className="project-eyedropper" onClick={() => void pickFromScreen()} aria-label="Pick color from screen" title="Pick color from screen"><Pipette /></button>
            <span className="project-color-current" style={{ background: draft }} />
            <input className="project-hue-slider" type="range" min="0" max="359" value={Math.round(hue)} aria-label="Hue" onChange={(event) => commit(hsvToHex(Number(event.target.value), saturation, brightness))} />
          </div>
          <label className="project-color-hex"><span>HEX</span><input value={draft.toUpperCase()} maxLength={7} onChange={(event) => { setDraft(event.target.value); const color = normalizeHex(event.target.value); if (color) onChange(color); }} /></label>
          <div className="project-rgb-values">
            {(["R", "G", "B"] as const).map((name, index) => (
              <label key={name}><input inputMode="numeric" value={[red, green, blue][index]} onChange={(event) => { const values = [red, green, blue]; values[index] = Number(event.target.value.replace(/\D/g, "")); commit(toHex(values[0], values[1], values[2])); }} /><span>{name}</span></label>
            ))}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
