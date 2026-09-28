"use client";
import { FormEvent, useState } from "react";
import { Camera, X } from "lucide-react";
import { api, type User } from "@/app/api/client";
import { Btn, Field, Input } from "@/components/ui";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
const options = [
  "USD",
  "THB",
  "EUR",
  "GBP",
  "JPY",
  "CNY",
  "KRW",
  "SGD",
  "AUD",
  "CAD",
].map((value) => ({ value, label: value }));
function load(file: File, set: (v: string) => void) {
  if (file.size > 1_500_000) return alert("Image must be under 1.5 MB");
  const reader = new FileReader();
  reader.onload = () => set(String(reader.result));
  reader.readAsDataURL(file);
}
export function ProfileModal({
  user,
  onChange,
  onClose,
}: {
  user: User;
  onChange: (u: User) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    display_name: user.display_name,
    email: user.email,
    default_currency: user.default_currency,
  });
  const [avatar, setAvatar] = useState(
    () => localStorage.getItem(`dc-avatar-${user.id}`) || "",
  );
  const [cover, setCover] = useState(
    () => localStorage.getItem(`dc-cover-${user.id}`) || "",
  );
  const [saving, setSaving] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      onChange(await api.updateProfile(form));
      avatar
        ? localStorage.setItem(`dc-avatar-${user.id}`, avatar)
        : localStorage.removeItem(`dc-avatar-${user.id}`);
      cover
        ? localStorage.setItem(`dc-cover-${user.id}`, cover)
        : localStorage.removeItem(`dc-cover-${user.id}`);
      onClose();
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form className="profile-modal" onSubmit={save}>
        <section>
          <div className="modal-head">
            <h2>Main Profile</h2>
            <button type="button" className="plain-close" onClick={onClose}>
              <X />
            </button>
          </div>
          <p className="profile-label">PHOTOS</p>
          <div className="profile-media-grid">
            <label className="upload-avatar">
              <span className="profile-label">PROFILE PHOTO</span>
              <span className="avatar-preview">
                {avatar ? (
                  <img src={avatar} alt="Profile preview" />
                ) : (
                  <Camera />
                )}
              </span>
              <strong>Profile photo</strong>
              <small>Click to change</small>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  e.target.files?.[0] && load(e.target.files[0], setAvatar)
                }
              />
            </label>
            <label className="upload-cover">
              <span className="profile-label">COVER PHOTO</span>
              <span
                className="cover-preview"
                style={cover ? { backgroundImage: `url(${cover})` } : undefined}
              >
                {!cover ? <Camera /> : null}
              </span>
              <strong>Cover photo</strong>
              <small>Click to upload</small>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  e.target.files?.[0] && load(e.target.files[0], setCover)
                }
              />
            </label>
          </div>
          <div className="account-form">
            <Field label="Username">
              <Input value={user.username} disabled />
            </Field>
            <Field label="Display name" required>
              <Input
                value={form.display_name}
                onChange={(e) =>
                  setForm({ ...form, display_name: e.target.value })
                }
              />
            </Field>
            <Field label="Email">
              <Input
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Default currency">
              <ThemedSelect
                value={form.default_currency}
                options={options}
                onChange={(v) => v && setForm({ ...form, default_currency: v })}
              />
            </Field>
          </div>
          <div className="modal-actions">
            <Btn type="button" variant="outline" onClick={onClose}>
              Cancel
            </Btn>
            <Btn loading={saving}>Save profile</Btn>
          </div>
        </section>
        <aside className="profile-modal-preview">
          <p className="profile-label">PREVIEW</p>
          <div className="preview-card">
            <div
              className="profile-cover"
              style={cover ? { backgroundImage: `url(${cover})` } : undefined}
            />
            <span className="preview-avatar">
              {avatar ? (
                <img src={avatar} alt="" />
              ) : (
                form.display_name.slice(0, 1)
              )}
            </span>
            <strong>{form.display_name}</strong>
            <span>@{user.username}</span>
            <small>{form.email || form.default_currency}</small>
          </div>
        </aside>
      </form>
    </div>
  );
}
