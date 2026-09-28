"use client";
import { forwardRef, useId } from "react";
import { Check } from "lucide-react";
type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size" | "type"
> & { label: React.ReactNode; description?: string };
export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, description, id, className = "", ...props },
  ref,
) {
  const generated = useId();
  const realId = id ?? generated;
  return (
    <label htmlFor={realId} className={`check-control ${className}`}>
      <span className="check-box">
        <input ref={ref} id={realId} type="checkbox" {...props} />
        <span>
          <Check />
        </span>
      </span>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
});
