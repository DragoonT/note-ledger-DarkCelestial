"use client";

import { useEffect, useState } from "react";

function clamp(value: string, maximum: number) {
  const number = Number(value.replace(/\D/g, ""));
  return Math.min(maximum, Math.max(0, Number.isFinite(number) ? number : 0));
}
function pad(value: number) {
  return String(value).padStart(2, "0");
}
function parse(value?: string) {
  const [hours, minutes] = (value || "00:00").split(":");
  return { hour: clamp(hours, 23), minute: clamp(minutes, 59) };
}

export function TimePicker({
  value = "00:00",
  onChange,
  disabled = false,
}: {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { hour, minute } = parse(value);
  const [hourInput, setHourInput] = useState(String(hour));
  const [minuteInput, setMinuteInput] = useState(String(minute));

  useEffect(() => {
    const parsed = parse(value);
    setHourInput(String(parsed.hour));
    setMinuteInput(String(parsed.minute));
  }, [value]);

  function changeHour(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setHourInput(digits);
    onChange(`${pad(clamp(digits, 23))}:${pad(minute)}`);
  }

  function changeMinute(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setMinuteInput(digits);
    onChange(`${pad(hour)}:${pad(clamp(digits, 59))}`);
  }

  return (
    <div className="time-inputs">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={hourInput}
        aria-label="Hour"
        onFocus={(event) => event.target.select()}
        onChange={(event) => changeHour(event.target.value)}
        onBlur={() => {
          const normalized = String(clamp(hourInput, 23));
          setHourInput(normalized);
          onChange(`${pad(Number(normalized))}:${pad(minute)}`);
        }}
      />
      <span>:</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={minuteInput}
        aria-label="Minute"
        onFocus={(event) => event.target.select()}
        onChange={(event) => changeMinute(event.target.value)}
        onBlur={() => {
          const normalized = String(clamp(minuteInput, 59));
          setMinuteInput(normalized);
          onChange(`${pad(hour)}:${pad(Number(normalized))}`);
        }}
      />
    </div>
  );
}
