"use client";

import { LoaderCircle } from "lucide-react";
import React from "react";

export function Card({
  children,
  className = "",
  id,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div id={id} className={`ui-card ${className}`} style={style}>
      {children}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  icon?: React.ReactNode;
  loading?: boolean;
};

export function Btn({
  variant = "primary",
  icon,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: BtnProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`ui-btn ${variant} ${className}`}
    >
      {loading ? <LoaderCircle className="spin" /> : icon}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  required,
  inlineHint = false,
  children,
  className = "",
}: {
  label: React.ReactNode;
  hint?: string;
  required?: boolean;
  inlineHint?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`ui-field ${className}`}>
      <span>
        {label}
        {hint && inlineHint ? <small className="ui-field-inline-hint"> ({hint})</small> : null}
        {required ? <b aria-hidden="true"> *</b> : null}
      </span>
      {children}
      {hint && !inlineHint ? <small>{hint}</small> : null}
    </label>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input(props, ref) {
  return (
    <input
      ref={ref}
      {...props}
      className={`ui-input ${props.className ?? ""}`}
    />
  );
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`ui-input ui-textarea ${props.className ?? ""}`}
    />
  );
});

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="empty">
      {icon}
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
    </div>
  );
}
