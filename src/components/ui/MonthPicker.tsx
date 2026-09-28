"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

function parseMonth(value?: string | null) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : null;
}

function ym(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthPicker({ value, onChange, placeholder = "Pick a month", disabled = false }: { value?: string | null; onChange: (value: string) => void; placeholder?: string; disabled?: boolean }) {
  const selected = parseMonth(value);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => (selected ?? new Date()).getFullYear());
  const [choosingYear, setChoosingYear] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function placePanel() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 320;
    const height = 235;
    const padding = 12;
    setStyle({
      position: "fixed",
      left: Math.min(Math.max(padding, rect.left), Math.max(padding, window.innerWidth - width - padding)),
      top: rect.bottom + height + padding > window.innerHeight ? Math.max(padding, rect.top - height - padding) : rect.bottom + 8,
      width,
      zIndex: 9999,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    placePanel();
    const reposition = () => placePanel();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const yearBlockStart = Math.floor(year / 12) * 12;
  const panel = open ? createPortal(
    <div ref={panelRef} style={style} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-[var(--foreground)] shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => setYear((current) => current - (choosingYear ? 12 : 1))} className="rounded-md p-1 hover:bg-[var(--muted)]" aria-label={choosingYear ? "Previous years" : "Previous year"}><ChevronLeft className="h-4 w-4" /></button>
        {choosingYear ? <strong className="px-2 py-1 text-sm">{yearBlockStart} – {yearBlockStart + 11}</strong> : <button type="button" onClick={() => setChoosingYear(true)} className="rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-[var(--muted)]" aria-label="Choose year">{year}</button>}
        <button type="button" onClick={() => setYear((current) => current + (choosingYear ? 12 : 1))} className="rounded-md p-1 hover:bg-[var(--muted)]" aria-label={choosingYear ? "Next years" : "Next year"}><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {choosingYear ? Array.from({ length: 12 }, (_, index) => yearBlockStart + index).map((optionYear) => <button key={optionYear} type="button" onClick={() => { setYear(optionYear); setChoosingYear(false); }} className={`h-9 rounded-md text-sm font-medium transition-colors ${optionYear === year ? "bg-[var(--brand)] text-white" : optionYear === new Date().getFullYear() ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "hover:bg-[var(--muted)]"}`}>{optionYear}</button>) : Array.from({ length: 12 }, (_, month) => {
          const option = new Date(year, month, 1);
          const active = selected && ym(option) === ym(selected);
          const current = ym(option) === ym(new Date());
          return <button key={month} type="button" onClick={() => { onChange(ym(option)); setOpen(false); }} className={`h-9 rounded-md text-sm font-medium transition-colors ${active ? "bg-[var(--brand)] text-white" : current ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "hover:bg-[var(--muted)]"}`}>{option.toLocaleDateString("en-US", { month: "short" })}</button>;
        })}
      </div>
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <button type="button" onClick={() => { onChange(ym(new Date())); setOpen(false); }} className="text-xs font-semibold text-[var(--brand)] hover:underline">This month</button>
      </div>
    </div>, document.body) : null;

  return <div ref={triggerRef} className="relative">
    <button type="button" disabled={disabled} onClick={() => { setYear((selected ?? new Date()).getFullYear()); setChoosingYear(false); if (!open) placePanel(); setOpen((current) => !current); }} className="box-border flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)]/40 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50">
      <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--muted-fg)]" />
      <span className={`flex-1 truncate ${!selected ? "text-[var(--muted-fg)]" : ""}`}>{selected ? selected.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : placeholder}</span>
    </button>
    {panel}
  </div>;
}
