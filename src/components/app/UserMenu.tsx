"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { ChevronDown, LogOut, Settings, ShieldCheck, X } from "lucide-react";
import type { User } from "@/app/api/client";
import { AccountPanel, type SettingsTab } from "@/components/accounts/AccountPanel";
import { useI18n } from "@/lib/i18n";
export function UserMenu({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [avatar] = useState(
    () => localStorage.getItem(`dc-avatar-${user.id}`) || "",
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  function capture(e: React.MouseEvent) {
    const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href?.startsWith("/settings/")) return;
    e.preventDefault();
    setSettings(
      href.endsWith("bank-fields")
        ? "bank-fields"
        : href.endsWith("delete-data")
        ? "delete-data"
        : href.endsWith("transaction-options")
        ? "transaction-options"
        : href.endsWith("all-accounts")
        ? "all-accounts"
        : href.endsWith("accounts")
          ? "create-account"
        : href.endsWith("appearance")
          ? "appearance"
        : href.endsWith("password")
          ? "password"
          : "profile",
    );
  }
  return (
    <div className="user-menu" ref={ref}>
      <button className="user-menu-trigger" onClick={() => setOpen(!open)}>
        <span className="user-avatar">
          {avatar ? (
            <Image src={avatar} width={29} height={29} unoptimized alt="" />
          ) : (
            user.display_name.slice(0, 1)
          )}
        </span>
        <span className="user-trigger-copy">
          <strong>{user.display_name}</strong>
          <small>@{user.username}</small>
        </span>
        <ChevronDown />
      </button>
      {open ? (
        <div className="user-menu-popover">
          <div className="user-menu-head">
            <span className="user-avatar large">
              {avatar ? (
                <Image src={avatar} width={42} height={42} unoptimized alt="" />
              ) : (
                user.display_name.slice(0, 1)
              )}
            </span>
            <div>
              <strong>{user.display_name}</strong>
              <p>@{user.username}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setSettings("profile");
            }}
          >
            <Settings />
            <span>
              <strong>{tr("Settings")}</strong>
                <small>{tr("Profile and accent color")}</small>
            </span>
          </button>
          {user.is_admin ? (
            <button
              onClick={() => {
                setOpen(false);
                setSettings("all-accounts");
              }}
            >
              <ShieldCheck />
              <span>
                <strong>{tr("Administration")}</strong>
                <small>{tr("Accounts and access")}</small>
              </span>
            </button>
          ) : null}
          <button className="signout" onClick={onLogout}>
            <LogOut />
            <span>
              <strong>{tr("Sign out")}</strong>
            </span>
          </button>
        </div>
      ) : null}
      {settings
        ? createPortal(
            <div
              className="modal-backdrop"
              onMouseDown={(e) =>
                e.target === e.currentTarget && setSettings(null)
              }
            >
              <div className="settings-modal-wrap" onClickCapture={capture}>
                <button
                  className="settings-modal-close"
                  onClick={() => setSettings(null)}
                  aria-label={tr("Close settings")}
                >
                  <X />
                </button>
                <AccountPanel
                  tab={settings}
                  user={user}
                  onUserChange={() => window.location.reload()}
                  onTabChange={setSettings}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
