"use client";

import type { ReactNode } from "react";

interface Bar {
  label: string;
  value: number;
  color?: string;
}

export interface BarGroup {
  label: string;
  bars: Bar[];
}

interface Props {
  data?: Bar[];
  groups?: BarGroup[];
  height?: number;
  className?: string;
  showValue?: boolean;
  itemWidth?: number;
  showYAxis?: boolean;
  valueOnTop?: boolean;
  rotateLabels?: boolean;
}

const DEFAULT_COLOR = "var(--brand)";
const Y_AXIS_WIDTH = 36;
const ROTATED_LABEL_BAND = 118;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function yTicks(max: number): number[] {
  const top = niceMax(max);
  return [0, top * 0.25, top * 0.5, top * 0.75, top];
}

function ChartScroll({
  width,
  minHeight,
  children,
}: {
  width: number;
  minHeight: number;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto overflow-y-visible">
      <div style={{ minWidth: width, minHeight }}>{children}</div>
    </div>
  );
}

function YAxisLabels({
  ticks,
  padTop,
  innerH,
  axisX,
}: {
  ticks: number[];
  padTop: number;
  innerH: number;
  axisX: number;
}) {
  const top = ticks[ticks.length - 1] ?? 1;
  return (
    <g>
      {ticks.map((tick) => {
        const y = padTop + innerH - (tick / top) * innerH;
        return (
          <g key={tick}>
            <line
              x1={axisX}
              x2={axisX + 4}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={axisX - 6}
              y={y + 3}
              textAnchor="end"
              className="fill-[var(--muted-fg)]"
              style={{ fontSize: 9 }}
            >
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function BarChart({
  data = [],
  groups,
  height = 220,
  className = "",
  showValue = true,
  itemWidth = 72,
  showYAxis = true,
  valueOnTop = true,
  rotateLabels,
}: Props) {
  if (groups && groups.length > 0) {
    return (
      <GroupedBarChart
        groups={groups}
        height={height}
        className={className}
        showValue={showValue}
        itemWidth={itemWidth}
        showYAxis={showYAxis}
        rotateLabels={rotateLabels ?? groups.length > 8}
      />
    );
  }

  const padX = showYAxis ? Y_AXIS_WIDTH + 8 : 24;
  const padTop = 24;
  const shouldRotate = rotateLabels ?? data.length > 8;
  const padBottom = shouldRotate ? ROTATED_LABEL_BAND : 32;
  const gap = 12;
  const w = Math.max(
    560,
    padX + 24 + data.length * itemWidth + Math.max(0, data.length - 1) * gap,
  );
  const h = height;
  const innerW = w - padX - 24;
  const innerH = h - padTop - padBottom;
  const maxRaw = Math.max(...data.map((d) => d.value), 1);
  const max = niceMax(maxRaw);
  const ticks = yTicks(maxRaw);
  const barW =
    data.length > 0
      ? Math.min(
          itemWidth - 8,
          (innerW - gap * (data.length - 1)) / data.length,
        )
      : itemWidth;
  const labelY = padTop + innerH + (shouldRotate ? 10 : 16);

  return (
    <div className={className}>
      <ChartScroll width={w} minHeight={h}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMinYMid meet"
        >
          {showYAxis ? (
            <YAxisLabels
              ticks={ticks}
              padTop={padTop}
              innerH={innerH}
              axisX={padX - 8}
            />
          ) : null}
          {ticks.slice(1).map((tick) => {
            const y = padTop + innerH - (tick / max) * innerH;
            return (
              <line
                key={tick}
                x1={padX}
                x2={w - 24}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })}
          {data.map((d, i) => {
            const x = padX + i * (barW + gap) + (itemWidth - barW) / 2;
            const barH = max > 0 ? (d.value / max) * innerH : 0;
            const y = padTop + innerH - barH;
            const color = d.color ?? DEFAULT_COLOR;
            const labelX = x + barW / 2;
            return (
              <g key={`${d.label}-${i}`}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={6}
                  fill={color}
                  opacity={0.9}
                />
                {showValue && valueOnTop && d.value > 0 && (
                  <text
                    x={labelX}
                    y={y - 6}
                    textAnchor="middle"
                    className="fill-[var(--foreground)]"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {d.value}
                  </text>
                )}
                {showValue && !valueOnTop && barH > 14 && (
                  <text
                    x={labelX}
                    y={y + 14}
                    textAnchor="middle"
                    className="fill-white"
                    style={{ fontSize: 10, fontWeight: 600 }}
                  >
                    {d.value}
                  </text>
                )}
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={shouldRotate ? "start" : "middle"}
                  transform={
                    shouldRotate
                      ? `rotate(32, ${labelX}, ${labelY})`
                      : undefined
                  }
                  className="fill-[var(--muted-fg)]"
                  style={{ fontSize: shouldRotate ? 8 : 10 }}
                >
                  <title>{d.label}</title>
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </ChartScroll>
    </div>
  );
}

function GroupedBarChart({
  groups,
  height,
  className,
  showValue,
  itemWidth,
  showYAxis,
  rotateLabels,
}: {
  groups: BarGroup[];
  height: number;
  className: string;
  showValue: boolean;
  itemWidth: number;
  showYAxis: boolean;
  rotateLabels: boolean;
}) {
  const padX = showYAxis ? Y_AXIS_WIDTH + 8 : 24;
  const padTop = 24;
  const padBottom = rotateLabels ? ROTATED_LABEL_BAND : 32;
  const plotHeight = height - padBottom;
  const groupGap = 10;
  const groupW = itemWidth;
  const w =
    padX +
    24 +
    groups.length * groupW +
    Math.max(0, groups.length - 1) * groupGap;
  const h = height;
  const innerH = plotHeight - padTop - 8;
  const axisY = padTop + innerH;
  const labelY = axisY + (rotateLabels ? 10 : 16);
  const allValues = groups.flatMap((group) =>
    group.bars.map((bar) => bar.value),
  );
  const maxRaw = Math.max(...allValues, 1);
  const max = niceMax(maxRaw);
  const ticks = yTicks(maxRaw);
  const barsPerGroup = groups[0]?.bars.length ?? 3;
  const barGap = 4;
  const barW = (groupW - barGap * (barsPerGroup - 1)) / barsPerGroup;
  const legend = groups[0]?.bars ?? [];

  return (
    <div className={className}>
      <ChartScroll width={w} minHeight={h}>
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="xMinYMid meet"
        >
          {showYAxis ? (
            <YAxisLabels
              ticks={ticks}
              padTop={padTop}
              innerH={innerH}
              axisX={padX - 8}
            />
          ) : null}
          {ticks.slice(1).map((tick) => {
            const y = padTop + innerH - (tick / max) * innerH;
            return (
              <line
                key={tick}
                x1={padX}
                x2={w - 24}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
            );
          })}
          {groups.map((group, groupIndex) => {
            const groupX = padX + groupIndex * (groupW + groupGap);
            const labelX = groupX + groupW / 2;
            return (
              <g key={group.label}>
                {group.bars.map((bar, barIndex) => {
                  const x = groupX + barIndex * (barW + barGap);
                  const barH = max > 0 ? (bar.value / max) * innerH : 0;
                  const y = padTop + innerH - barH;
                  const color = bar.color ?? DEFAULT_COLOR;
                  return (
                    <g key={`${group.label}-${bar.label}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={barH}
                        rx={4}
                        fill={color}
                        opacity={0.9}
                      />
                      {showValue && bar.value > 0 && (
                        <text
                          x={x + barW / 2}
                          y={y - 5}
                          textAnchor="middle"
                          className="fill-[var(--foreground)]"
                          style={{ fontSize: 9, fontWeight: 600 }}
                        >
                          {bar.value}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={rotateLabels ? "start" : "middle"}
                  transform={
                    rotateLabels
                      ? `rotate(32, ${labelX}, ${labelY})`
                      : undefined
                  }
                  className="fill-[var(--muted-fg)]"
                  style={{ fontSize: rotateLabels ? 8 : 10 }}
                >
                  <title>{group.label}</title>
                  {group.label}
                </text>
              </g>
            );
          })}
        </svg>
      </ChartScroll>
      {legend.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 border-t border-[var(--border)]/60 pt-3">
          {legend.map((bar) => (
            <span
              key={bar.label}
              className="inline-flex items-center gap-1.5 text-xs text-[var(--muted-fg)]"
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: bar.color ?? DEFAULT_COLOR }}
              />
              {bar.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
