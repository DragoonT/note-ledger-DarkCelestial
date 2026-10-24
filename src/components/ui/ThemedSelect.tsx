"use client";

import { Check, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export function ThemedSelect<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  clearable = false,
  onCreate,
  createLabel = (name) => `Use "${name}"`,
}: {
  value: T | "";
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T | "") => void;
  disabled?: boolean;
  placeholder?: string;
  clearable?: boolean;
  onCreate?: (name: string) => void;
  createLabel?: (name: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const normalized = query.trim().toLowerCase();
  const canCreate = Boolean(onCreate && normalized && !options.some(option => option.label.trim().toLowerCase() === normalized));
  function create() {
    if (!canCreate) return;
    onCreate?.(query.trim());
    setOpen(false);
    setQuery("");
  }
  const filtered = normalized
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalized),
      )
    : options;

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !wrapRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function placeMenu() {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const padding = 16;
    const gap = 4;
    const below = window.innerHeight - rect.bottom - padding - gap;
    const above = rect.top - padding - gap;
    const dropUp = below < 180 && above > below;
    setMenuStyle({
      position: "fixed",
      left: Math.min(rect.left, window.innerWidth - rect.width - padding),
      width: rect.width,
      maxHeight: Math.min(280, Math.max(110, dropUp ? above : below)),
      zIndex: 9999,
      ...(dropUp
        ? { bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap }),
    });
  }

  useLayoutEffect(() => {
    if (!open || disabled) return;
    placeMenu();
    const reposition = () => placeMenu();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, disabled, options.length]);

  function select(option: (typeof options)[number]) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setQuery("");
  }

  const menu =
    open && !disabled
      ? createPortal(
          <div ref={menuRef} style={menuStyle} className="themed-select-menu">
            <div className="themed-select-options">
              {canCreate ? <button type="button" className="themed-select-option" onMouseDown={event => event.preventDefault()} onClick={create}><span>{createLabel(query.trim())}</span></button> : null}
              {filtered.length ? (
                filtered.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    disabled={option.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => select(option)}
                    className={`themed-select-option ${option.value === value ? "selected" : ""}`}
                  >
                    <Check />
                    <span title={option.label}>{option.label}</span>
                  </button>
                ))
              ) : canCreate ? null : (
                <p className="themed-select-empty">No matches</p>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={wrapRef} className="themed-select-input-wrap">
      <input
        type="text"
        disabled={disabled}
        value={open ? query : (selected?.label ?? "")}
        placeholder={placeholder}
        onFocus={(event) => {
          setQuery(selected?.label ?? "");
          setOpen(true);
          placeMenu();
          requestAnimationFrame(() => event.target.select());
        }}
        onClick={() => {
          if (!open) {
            setQuery(selected?.label ?? "");
            setOpen(true);
            placeMenu();
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
          if (event.key === "Enter" && canCreate) {
            event.preventDefault();
            create();
            return;
          }
          if (event.key === "Enter" && filtered[0]) {
            event.preventDefault();
            select(filtered[0]);
          }
        }}
        className="themed-select-input"
      />
      {clearable && value && !disabled ? (
        <button
          type="button"
          className="themed-select-clear"
          aria-label="Clear selection"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            onChange("");
            setQuery("");
          }}
        >
          <X />
        </button>
      ) : (
        <Search />
      )}
      {menu}
    </div>
  );
}
