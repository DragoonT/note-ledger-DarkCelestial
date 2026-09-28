"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AreaChart as AreaIcon,
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
} from "lucide-react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/Tabs";
import { money, sumCents, type BankAccount, type Transaction } from "@/app/api/client";
import { useI18n } from "@/lib/i18n";

type TrendView = "year" | "month";
type ChartKind = "area" | "bar" | "line" | "pie";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const INCOME = "#22c55e";
const EXPENSE = "#f43f5e";
const TOTAL_MONEY = "#a78bfa";
const SALARY_INCOME = "#bef264";
const NON_SALARY_EXPENSE = "#ff0000";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${active ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm" : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]/60"}`}
    >
      {children}
    </button>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-lg px-2 py-2 text-center ring-1 ring-[var(--border)] dashboard-metric-${tone}`}
    >
      <p className="truncate text-[8px] font-bold uppercase leading-tight tracking-wide opacity-95">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xl font-extrabold leading-none tabular-nums">
        {value}
      </p>
    </div>
  );
}

export function AccountingDashboard({
  rows,
  accounts,
  currency,
}: {
  rows: Transaction[];
  accounts: BankAccount[];
  currency: string;
  onRefresh: () => void;
}) {
  const { tr } = useI18n();
  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const values = Array.from(
      new Set(rows.map((row) => Number(row.transaction_date.slice(0, 4)))),
    )
      .filter(Number.isFinite)
      .sort((a, b) => b - a);
    return values.length ? values : [now.getFullYear()];
  }, [rows, now]);
  const [view, setView] = useState<TrendView>("year");
  const [year, setYear] = useState(() => yearOptions[0]);
  const [month, setMonth] = useState(() => now.getMonth());
  const [chartKind, setChartKind] = useState<ChartKind>("bar");
  const scoped = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.transfer_id &&
          row.currency === currency &&
          row.transaction_date.startsWith(
            `${year}-${view === "month" ? String(month + 1).padStart(2, "0") : ""}`,
          ),
      ),
    [currency, month, rows, view, year],
  );
  const chartData = useMemo(() => {
    const groups =
      view === "year"
        ? MONTHS.map((period, index) => ({
            period,
            matches: (row: Transaction) =>
              Number(row.transaction_date.slice(5, 7)) === index + 1,
          }))
        : accounts.map((account) => ({
            period: account.name,
            matches: (row: Transaction) => row.account_id === account.id,
          }));
    return groups.map(({ period, matches }) => {
      const groupRows = scoped.filter(matches);
      const incomeCents = sumCents(groupRows.filter((row) => row.kind === "income").map((row) => row.amount_cents));
      const expenseCents = sumCents(groupRows.filter((row) => row.kind === "expense").map((row) => row.amount_cents));
      const salaryIncomeCents = sumCents(groupRows
        .filter(
          (row) =>
            row.kind === "income" &&
            row.category.trim().toLowerCase() === "salary",
        )
        .map((row) => row.amount_cents));
      const nonSalaryExpenseCents = sumCents(groupRows
        .filter(
          (row) =>
            row.kind === "expense" &&
            row.category.trim().toLowerCase() !== "salary",
        )
        .map((row) => row.amount_cents));
      const totalMoneyCents = incomeCents - expenseCents;
      return {
        period,
        totalMoney: Number(totalMoneyCents) / 100,
        income: Number(incomeCents) / 100,
        expense: Number(expenseCents) / 100,
        salaryIncome: Number(salaryIncomeCents) / 100,
        nonSalaryExpense: Number(nonSalaryExpenseCents) / 100,
        totalMoneyCents: totalMoneyCents.toString(),
        incomeCents: incomeCents.toString(),
        expenseCents: expenseCents.toString(),
        salaryIncomeCents: salaryIncomeCents.toString(),
        nonSalaryExpenseCents: nonSalaryExpenseCents.toString(),
      };
    });
  }, [accounts, scoped, view]);
  const incomeRows = scoped.filter((row) => row.kind === "income");
  const expenseRows = scoped.filter((row) => row.kind === "expense");
  const income = sumCents(incomeRows.map((row) => row.amount_cents));
  const expense = sumCents(expenseRows.map((row) => row.amount_cents));
  const salaryIncome = sumCents(incomeRows
    .filter((row) => row.category.trim().toLowerCase() === "salary")
    .map((row) => row.amount_cents));
  const nonSalaryExpense = sumCents(expenseRows
    .filter((row) => row.category.trim().toLowerCase() !== "salary")
    .map((row) => row.amount_cents));
  const totalMoney = income - expense;
  const periodLabel =
    view === "year" ? String(year) : `${MONTHS[month]} ${year}`;
  const hasData = chartData.some((point) => point.income || point.expense);
  const cards = [
    [tr("Total money").toUpperCase(), money(totalMoney, currency), "violet"],
    [tr("Income").toUpperCase(), money(income, currency), "green"],
    [tr("Expense").toUpperCase(), money(expense, currency), "red"],
    [tr("Salary income").toUpperCase(), money(salaryIncome, currency), "lime"],
    [
      tr("Non-salary expenses").toUpperCase(),
      money(nonSalaryExpense, currency),
      "pure-red",
    ],
  ];
  const formatTooltip = (value: unknown, name: unknown, item: { dataKey?: string | number; payload?: Record<string, unknown> }) => {
    const exact = item.payload?.[`${String(item.dataKey)}Cents`];
    return [money(typeof exact === "string" ? exact : Math.round(Number(Array.isArray(value) ? value[0] : (value ?? 0)) * 100), currency), String(name)] as [string, string];
  };
  const yAxisFormatter = (value: number) =>
    new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const tooltipStyle = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--foreground)",
  };
  function renderChart(kind: ChartKind) {
    if (kind === "pie") {
      const data = [
        { name: tr("Total money"), value: Number(totalMoney) / 100, valueCents: totalMoney.toString(), fill: TOTAL_MONEY },
        { name: tr("Income"), value: Number(income) / 100, valueCents: income.toString(), fill: INCOME },
        { name: tr("Expense"), value: Number(expense) / 100, valueCents: expense.toString(), fill: EXPENSE },
        {
          name: tr("Salary income"),
          value: Number(salaryIncome) / 100,
          valueCents: salaryIncome.toString(),
          fill: SALARY_INCOME,
        },
        {
          name: tr("Non-salary expenses"),
          value: Number(nonSalaryExpense) / 100,
          valueCents: nonSalaryExpense.toString(),
          fill: NON_SALARY_EXPENSE,
        },
      ].filter((item) => item.value > 0);
      return (
        <PieChart>
          <Tooltip
            formatter={formatTooltip}
            contentStyle={tooltipStyle}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={95}
            strokeWidth={3}
            stroke="var(--card)"
          >
            {data.map((item) => (
              <Cell key={item.name} fill={item.fill} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      );
    }
    if (kind === "area")
      return (
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            stroke="var(--muted-fg)"
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            stroke="var(--muted-fg)"
            tickFormatter={yAxisFormatter}
          />
          <Tooltip
            formatter={formatTooltip}
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--muted)", opacity: 0.12 }}
          />
          <Legend />
          <Area
            dataKey="totalMoney"
            name={tr("Total money")}
            type="monotone"
            fill={TOTAL_MONEY}
            fillOpacity={0.18}
            stroke={TOTAL_MONEY}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            dataKey="income"
            name="Income"
            type="monotone"
            fill={INCOME}
            fillOpacity={0.25}
            stroke={INCOME}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            dataKey="expense"
            name="Expense"
            type="monotone"
            fill={EXPENSE}
            fillOpacity={0.25}
            stroke={EXPENSE}
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area dataKey="salaryIncome" name={tr("Salary income")} type="monotone" fill={SALARY_INCOME} fillOpacity={0.18} stroke={SALARY_INCOME} strokeWidth={2} isAnimationActive={false} />
          <Area dataKey="nonSalaryExpense" name={tr("Non-salary expenses")} type="monotone" fill={NON_SALARY_EXPENSE} fillOpacity={0.18} stroke={NON_SALARY_EXPENSE} strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      );
    if (kind === "line")
      return (
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 3"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            stroke="var(--muted-fg)"
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            stroke="var(--muted-fg)"
            tickFormatter={yAxisFormatter}
          />
          <Tooltip
            formatter={formatTooltip}
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--border)" }}
          />
          <Legend />
          <Line
            dataKey="totalMoney"
            name={tr("Total money")}
            type="monotone"
            stroke={TOTAL_MONEY}
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="income"
            name="Income"
            type="monotone"
            stroke={INCOME}
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="expense"
            name="Expense"
            type="monotone"
            stroke={EXPENSE}
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          <Line dataKey="salaryIncome" name={tr("Salary income")} type="monotone" stroke={SALARY_INCOME} strokeWidth={2} dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          <Line dataKey="nonSalaryExpense" name={tr("Non-salary expenses")} type="monotone" stroke={NON_SALARY_EXPENSE} strokeWidth={2} dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      );
    return (
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        barGap={2}
        barCategoryGap="20%"
      >
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="var(--border)"
        />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          stroke="var(--muted-fg)"
          interval={0}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={64}
          stroke="var(--muted-fg)"
          tickFormatter={yAxisFormatter}
        />
        <Tooltip
          formatter={formatTooltip}
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.12 }}
        />
        <Legend />
        <Bar
          dataKey="totalMoney"
          name={tr("Total money")}
          fill={TOTAL_MONEY}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
          isAnimationActive={false}
        />
        <Bar
          dataKey="income"
          name="Income"
          fill={INCOME}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expense"
          name="Expense"
          fill={EXPENSE}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
          isAnimationActive={false}
        />
        <Bar dataKey="salaryIncome" name={tr("Salary income")} fill={SALARY_INCOME} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
        <Bar dataKey="nonSalaryExpense" name={tr("Non-salary expenses")} fill={NON_SALARY_EXPENSE} radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
      </BarChart>
    );
  }

  return (
    <section className="space-y-4 p-1">
      <div className="flex flex-col gap-4 xl:flex-row">
        <aside className="w-full shrink-0 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm xl:w-56">
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-fg)]">
              {tr("VIEW")}
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={view === "year"}
                onClick={() => setView("year")}
              >
                {tr("Year")}
              </FilterChip>
              <FilterChip
                active={view === "month"}
                onClick={() => setView("month")}
              >
                {tr("Month")}
              </FilterChip>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-fg)]">
              {tr("YEAR")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {yearOptions.map((value) => (
                <FilterChip
                  key={value}
                  active={year === value}
                  onClick={() => setYear(value)}
                >
                  {value}
                </FilterChip>
              ))}
            </div>
          </div>
          {view === "month" ? (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-fg)]">
                {tr("MONTH")}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((label, index) => (
                  <FilterChip
                    key={label}
                    active={month === index}
                    onClick={() => setMonth(index)}
                  >
                    {label}
                  </FilterChip>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
        <div className="min-w-0 flex-1 space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-fg)]">
              {tr("DASHBOARD MONITORING")}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-fg)]">
              Income and expenses for {periodLabel} · {currency}
            </p>
          </div>
          <div className="flex justify-center">
            <div className="grid w-full max-w-6xl grid-cols-2 gap-1.5 lg:grid-cols-5">
              {cards.map(([label, value, tone]) => (
                <MetricTile
                  key={label}
                  label={label}
                  value={value}
                  tone={tone}
                />
              ))}
            </div>
          </div>
          <Tabs
            value={chartKind}
            onChange={(value) => setChartKind(value as ChartKind)}
            variant="underline"
            className="w-full"
          >
            <TabList className="gap-4">
              <Tab value="area" icon={<AreaIcon className="h-4 w-4" />}>
                {tr("Area Chart")}
              </Tab>
              <Tab value="bar" icon={<BarChart3 className="h-4 w-4" />}>
                {tr("Bar Chart")}
              </Tab>
              <Tab value="line" icon={<LineIcon className="h-4 w-4" />}>
                {tr("Line Chart")}
              </Tab>
              <Tab value="pie" icon={<PieIcon className="h-4 w-4" />}>
                {tr("Pie Chart")}
              </Tab>
            </TabList>
            {(["area", "bar", "line", "pie"] as ChartKind[]).map((kind) => (
              <TabPanel key={kind} value={kind}>
                <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-sm">
                  <header className="flex flex-col space-y-1.5 p-6 pb-3">
                    <h3 className="text-base font-semibold leading-none tracking-tight">
                      {tr("Income & Expense Comparison")}
                    </h3>
                    <p className="text-xs text-[var(--muted-fg)]">
                      Income and expenses{" "}
                      {view === "year"
                        ? "per month"
                        : "grouped by bank account"}{" "}
                      — {periodLabel}.
                    </p>
                  </header>
                  <div className="p-6 pt-0">
                    {!hasData ? (
                      <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--muted-fg)]">
                        {tr("No income or expense data for this period.")}
                      </div>
                    ) : (
                      <div className="h-[360px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          {renderChart(kind)}
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </article>
              </TabPanel>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  );
}
