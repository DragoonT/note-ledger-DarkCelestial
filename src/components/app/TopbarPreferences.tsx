"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Globe2, Monitor, Moon, Sun } from "lucide-react";
import { type Locale, useI18n } from "@/lib/i18n";

function applyTheme(theme: string) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem("pl-theme", theme);
}

export function TopbarPreferences() {
  const { locale, setLocale, tr, catalog } = useI18n();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("pl-theme") || "system",
  );
  const [open, setOpen] = useState<"language" | "theme" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const themes = [
    ["light", tr("Light"), Sun],
    ["dark", tr("Dark"), Moon],
    ["system", tr("System"), Monitor],
  ] as const;
  const languages: [Locale, string, string][] = [
    ["en", "GB", catalog.language.english],
    ["th", "TH", catalog.language.thai],
  ];

  return (
    <div className="topbar-preferences" ref={ref}>
      <div className="topbar-preference">
        <button
          type="button"
          className={open === "language" ? "active" : ""}
          onClick={() => setOpen(open === "language" ? null : "language")}
          aria-label={catalog.settings.language}
        >
          <Globe2 />
        </button>
        {open === "language" ? (
          <div className="topbar-preference-menu language-menu">
            {languages.map(([value, short, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setLocale(value);
                  setOpen(null);
                }}
              >
                <b>{short}</b>
                <span>{label}</span>
                <small>{value.toUpperCase()}</small>
                {locale === value ? <Check /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="topbar-preference">
        <button
          type="button"
          className={open === "theme" ? "active" : ""}
          onClick={() => setOpen(open === "theme" ? null : "theme")}
          aria-label={tr("Theme")}
        >
          {theme === "light" ? <Sun /> : theme === "dark" ? <Moon /> : <Monitor />}
        </button>
        {open === "theme" ? (
          <div className="topbar-preference-menu theme-menu">
            {themes.map(([value, label, Icon]) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setTheme(value);
                  applyTheme(value);
                  setOpen(null);
                }}
              >
                <Icon />
                <span>{label}</span>
                {theme === value ? <Check /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
