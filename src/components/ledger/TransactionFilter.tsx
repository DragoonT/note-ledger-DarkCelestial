"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { TransactionKind } from "@/app/api/client";
import { useI18n } from "@/lib/i18n";
type FilterTab = "type" | "year" | "month";
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function TransactionFilter({
  kinds,
  selectedYears,
  selectedMonths,
  years,
  onKinds,
  onYears,
  onMonths,
}: {
  kinds: TransactionKind[];
  selectedYears: string[];
  selectedMonths: string[];
  years: string[];
  onKinds: (values: TransactionKind[]) => void;
  onYears: (values: string[]) => void;
  onMonths: (values: string[]) => void;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterTab>("type");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const root = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const count = kinds.length + selectedYears.length + selectedMonths.length;
  useEffect(() => {
    function close(event: PointerEvent) {
      if (
        !root.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, []);
  useLayoutEffect(() => {
    if (!open || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    const width = 310;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left,
      width,
      zIndex: 90,
    });
  }, [open]);
  const options =
    tab === "type"
      ? [
          { value: "all", label: tr("All types") },
          { value: "income", label: tr("Income") },
          { value: "expense", label: tr("Expense") },
        ]
      : tab === "year"
        ? [
            { value: "all", label: tr("All years") },
            ...years.map((value) => ({ value, label: value })),
          ]
        : [
            { value: "all", label: tr("All months") },
            ...months.map((label, index) => ({
              value: String(index + 1).padStart(2, "0"),
              label,
            })),
          ];
  const selected: readonly string[] =
    tab === "type" ? kinds : tab === "year" ? selectedYears : selectedMonths;
  function choose(value: string) {
    if (tab === "type") {
      if (value === "all") onKinds([]);
      else onKinds(kinds.includes(value as TransactionKind) ? kinds.filter((item) => item !== value) : [...kinds, value as TransactionKind]);
    } else if (tab === "year") {
      if (value === "all") onYears([]);
      else onYears(selectedYears.includes(value) ? selectedYears.filter((item) => item !== value) : [...selectedYears, value]);
    } else {
      if (value === "all") onMonths([]);
      else onMonths(selectedMonths.includes(value) ? selectedMonths.filter((item) => item !== value) : [...selectedMonths, value]);
    }
  }
  function clear() {
    onKinds([]);
    onYears([]);
    onMonths([]);
  }
  return (
    <div className="combined-filter" ref={root}>
      <button
        type="button"
        className={count ? "active" : ""}
        onClick={() => setOpen((value) => !value)}
      >
        {count ? `${count} selected` : tr("All")}
        <ChevronDown className={open ? "rotate" : ""} />
      </button>
      {open
        ? createPortal(
            <div ref={menuRef} className="combined-filter-menu" style={menuStyle}>
              <button
                type="button"
                className={`combined-filter-all ${count === 0 ? "selected" : ""}`}
                onClick={clear}
              >
                All
              </button>
              <div className="combined-filter-tabs">
                {(["type", "year", "month"] as FilterTab[]).map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={tab === value ? "active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {value[0].toUpperCase() + value.slice(1)}
                    {(
                      value === "type"
                        ? kinds.length
                        : value === "year"
                          ? selectedYears.length
                          : selectedMonths.length
                    ) ? (
                      <span>{value === "type" ? kinds.length : value === "year" ? selectedYears.length : selectedMonths.length}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <div className="combined-filter-options">
                {options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={(option.value === "all" ? selected.length === 0 : selected.includes(option.value)) ? "selected" : ""}
                    onClick={() => choose(option.value)}
                  >
                    <span className="filter-check">
                      {(option.value === "all" ? selected.length === 0 : selected.includes(option.value)) ? <Check /> : null}
                    </span>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
