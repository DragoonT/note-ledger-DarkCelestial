"use client";

import { createContext, useContext, useState } from "react";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  variant: "underline" | "pills" | "boxed";
}

const Ctx = createContext<TabsCtx | null>(null);

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  variant?: "underline" | "pills" | "boxed";
  children: React.ReactNode;
  className?: string;
}

export function Tabs({
  defaultValue,
  value,
  onChange,
  variant = "underline",
  children,
  className = "",
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const controlled = value !== undefined;
  const current = controlled ? (value as string) : internal;
  const set = (v: string) => {
    if (!controlled) setInternal(v);
    onChange?.(v);
  };
  return (
    <Ctx.Provider value={{ value: current, setValue: set, variant }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx)!;
  const wrap =
    ctx.variant === "underline"
      ? "flex gap-1 border-b border-[var(--border)] overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      : ctx.variant === "pills"
        ? "inline-flex gap-1 p-1 rounded-xl bg-[var(--muted)]"
        : "inline-flex border border-[var(--border)] rounded-xl overflow-hidden divide-x divide-[var(--border)]";
  return (
    <div role="tablist" className={`${wrap} ${className}`}>
      {children}
    </div>
  );
}

interface TabProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export function Tab({ value, children, disabled, icon }: TabProps) {
  const ctx = useContext(Ctx)!;
  const active = ctx.value === value;

  const base =
    "px-4 py-2 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants =
    ctx.variant === "underline"
      ? active
        ? "border-b-2 border-[var(--brand)] text-[var(--brand)] -mb-px"
        : "border-b-2 border-transparent text-[var(--muted-fg)] hover:text-[var(--foreground)]"
      : ctx.variant === "pills"
        ? active
          ? "bg-[var(--background)] text-[var(--foreground)] rounded-lg shadow-sm"
          : "rounded-lg text-[var(--muted-fg)] hover:text-[var(--foreground)]"
        : active
          ? "bg-[var(--brand-soft)] text-[var(--brand)]"
          : "text-[var(--muted-fg)] hover:bg-[var(--muted)]";
  return (
    <button
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={() => ctx.setValue(value)}
      className={`${base} ${variants}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function TabPanel({
  value,
  children,
  className = "",
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx)!;
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={`pt-4 ${className}`}>
      {children}
    </div>
  );
}
