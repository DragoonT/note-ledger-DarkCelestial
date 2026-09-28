"use client";

import { Input } from "./base";

type Segment = { kind: "number" | "text"; length: number | null };

function segment(token: string): Segment | null {
  const match = /^(number|text)(?::(\d+|\*))?$/i.exec(token.trim());
  if (!match) return null;
  return {
    kind: match[1].toLowerCase() as Segment["kind"],
    length: match[2] && match[2] !== "*" ? Number(match[2]) : null,
  };
}

function readParts(value: string, count: number) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return Array.from({ length: count }, (_, index) => String(parsed[index] ?? ""));
  } catch {}
  return Array.from({ length: count }, (_, index) => index === 0 ? value : "");
}

export function SegmentedInput({ value, tokens, onChange }: { value: string; tokens: string[]; onChange: (value: string) => void }) {
  const segments = tokens.map(segment).filter((item): item is Segment => Boolean(item));
  const parts = readParts(value, segments.length);
  let fieldIndex = 0;
  return <div className="segmented-input">
    {tokens.map((token, tokenIndex) => {
      const config = segment(token);
      if (!config) return <span className="segmented-separator" key={`${token}-${tokenIndex}`}>{token}</span>;
      const index = fieldIndex++;
      return <Input
        key={`${token}-${tokenIndex}`}
        value={parts[index] ?? ""}
        inputMode={config.kind === "number" ? "numeric" : "text"}
        maxLength={config.length ?? undefined}
        aria-label={`${config.kind} segment ${index + 1}`}
        onChange={(event) => {
          const next = [...parts];
          next[index] = config.kind === "number" ? event.target.value.replace(/\D/g, "") : event.target.value;
          onChange(JSON.stringify(next));
        }}
      />;
    })}
  </div>;
}
