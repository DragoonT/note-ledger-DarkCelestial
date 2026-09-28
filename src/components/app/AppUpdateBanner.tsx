"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
async function fetchVersion() {
  try {
    const response = await fetch("/api/runtime-version", { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}
export function AppUpdateBanner() {
  const { tr } = useI18n();
  const [show, setShow] = useState(false);
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    let closed = false;
    async function check() {
      const version = await fetchVersion();
      if (closed || !version) return;
      if (!baseline.current) {
        baseline.current = version;
        return;
      }
      if (baseline.current !== version) setShow(true);
    }
    void check();
    const timer = window.setInterval(() => void check(), 15000);
    return () => {
      closed = true;
      window.clearInterval(timer);
    };
  }, []);
  if (!show) return null;
  function restartWebsite() {
    window.dispatchEvent(new Event("darkcelestial-intentional-reload"));
    window.location.reload();
  }
  return (
    <div className="update-banner">
      <p>{tr("A new update is available. Restart the website to use the latest version.")}</p>
      <button onClick={restartWebsite}>
        {tr("Restart website")}
      </button>
    </div>
  );
}
