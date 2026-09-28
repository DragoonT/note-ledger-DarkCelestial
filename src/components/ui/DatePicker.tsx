"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

type Panel = "days" | "months" | "years";

function parseDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled = false,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? new Date());
  const [panel, setPanel] = useState<Panel>("days");
  const [style, setStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        setOpen(false);
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function placePanel() {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 320;
    const height = 340;
    const padding = 12;
    const left = Math.min(
      Math.max(padding, rect.left),
      Math.max(padding, window.innerWidth - width - padding),
    );
    const top =
      rect.bottom + height + padding > window.innerHeight
        ? Math.max(padding, rect.top - height - padding)
        : rect.bottom + 8;
    setStyle({ position: "fixed", top, left, width, zIndex: 9999 });
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

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const yearBlockStart = Math.floor(year / 12) * 12;
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  function shift(delta: number) {
    if (panel === "years") setView(new Date(year + delta * 12, month, 1));
    else if (panel === "months") setView(new Date(year + delta, month, 1));
    else setView(new Date(year, month + delta, 1));
  }

  function pickMonth(nextMonth: number) {
    setView(new Date(year, nextMonth, 1));
    setPanel("days");
  }

  function pickYear(nextYear: number) {
    setView(new Date(nextYear, month, 1));
    setPanel("months");
  }

  const headerLabel =
    panel === "years"
      ? `${yearBlockStart} – ${yearBlockStart + 11}`
      : panel === "months"
        ? String(year)
        : view.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          });

  const calendarPanel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={style}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-[var(--foreground)] shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="rounded-md p-1 hover:bg-[var(--muted)]"
              aria-label={
                panel === "years"
                  ? "Previous years"
                  : panel === "months"
                    ? "Previous year"
                    : "Previous month"
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {panel === "years" ? (
              <strong className="px-2 py-1 text-sm">{headerLabel}</strong>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setPanel((current) =>
                    current === "days" ? "months" : "years",
                  )
                }
                className="rounded-md px-2 py-1 text-sm font-semibold transition-colors hover:bg-[var(--muted)]"
                aria-label={panel === "days" ? "Choose month" : "Choose year"}
              >
                {headerLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => shift(1)}
              className="rounded-md p-1 hover:bg-[var(--muted)]"
              aria-label={
                panel === "years"
                  ? "Next years"
                  : panel === "months"
                    ? "Next year"
                    : "Next month"
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {panel === "years" ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, index) => yearBlockStart + index).map(
                (optionYear) => (
                  <button
                    key={optionYear}
                    type="button"
                    onClick={() => pickYear(optionYear)}
                    className={`h-9 rounded-md text-sm font-medium transition-colors ${optionYear === year ? "bg-[var(--brand)] text-white" : optionYear === new Date().getFullYear() ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "hover:bg-[var(--muted)]"}`}
                  >
                    {optionYear}
                  </button>
                ),
              )}
            </div>
          ) : panel === "months" ? (
            <div className="grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, optionMonth) => (
                <button
                  key={optionMonth}
                  type="button"
                  onClick={() => pickMonth(optionMonth)}
                  className={`h-9 rounded-md text-sm font-medium transition-colors ${optionMonth === month ? "bg-[var(--brand)] text-white" : year === new Date().getFullYear() && optionMonth === new Date().getMonth() ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "hover:bg-[var(--muted)]"}`}
                >
                  {new Date(year, optionMonth, 1).toLocaleDateString("en-US", {
                    month: "short",
                  })}
                </button>
              ))}
            </div>
          ) : (
            <>
          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-[var(--muted-fg)]">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, index) =>
              day === null ? (
                <span key={index} />
              ) : (
                (() => {
                  const date = new Date(year, month, day);
                  const active = selected && ymd(date) === ymd(selected);
                  const current = ymd(date) === ymd(new Date());
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        onChange(ymd(date));
                        setOpen(false);
                      }}
                      className={`h-9 w-9 rounded-md text-sm font-medium transition-colors ${active ? "bg-[var(--brand)] text-white" : current ? "bg-[var(--brand-soft)] text-[var(--brand)]" : "hover:bg-[var(--muted)]"}`}
                    >
                      {day}
                    </button>
                  );
                })()
              ),
            )}
          </div>
            </>
          )}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={() => {
                onChange(ymd(new Date()));
                setOpen(false);
              }}
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              Today
            </button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setView(selected ?? new Date());
          setPanel("days");
          if (!open) placePanel();
          setOpen((current) => !current);
        }}
        className="box-border flex min-h-11 w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--muted)]/40 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[var(--muted-fg)]" />
        <span
          className={`flex-1 truncate ${!selected ? "text-[var(--muted-fg)]" : ""}`}
        >
          {selected
            ? selected.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : placeholder}
        </span>
      </button>
      {calendarPanel}
    </div>
  );
}
