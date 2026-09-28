"use client";

import { useCallback, useEffect, useState } from "react";
import en from "@/locales/en.json";
import th from "@/locales/th.json";

export type Locale = "en" | "th";
type Catalog = typeof en;
const catalogs: Record<Locale, Catalog> = { en, th };
const LANGUAGE_EVENT = "darkcelestial-language-change";

function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem("pl-locale") === "th" ? "th" : "en";
}

export function setAppLocale(locale: Locale) {
  localStorage.setItem("pl-locale", locale);
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: locale }));
}

export function useI18n() {
  const [locale, setLocale] = useState<Locale>(getLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
    const update = (event: Event) =>
      setLocale((event as CustomEvent<Locale>).detail ?? getLocale());
    const storage = () => setLocale(getLocale());
    window.addEventListener(LANGUAGE_EVENT, update);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, update);
      window.removeEventListener("storage", storage);
    };
  }, [locale]);
  const tr = useCallback(
    (text: string) =>
      catalogs[locale].text[text as keyof Catalog["text"]] ?? text,
    [locale],
  );
  return { locale, setLocale: setAppLocale, tr, catalog: catalogs[locale] };
}
