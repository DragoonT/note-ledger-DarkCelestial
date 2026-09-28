import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui";
import { money, sumCents, type Transaction } from "@/app/api/client";
import { useI18n } from "@/lib/i18n";

export function MoneySummaryCards({
  rows,
  currency,
  excludeTransfers = false,
}: {
  rows: Transaction[];
  currency: string;
  excludeTransfers?: boolean;
}) {
  const { tr } = useI18n();
  const countedRows = excludeTransfers
    ? rows.filter((row) => !row.transfer_id)
    : rows;
  const totals = {
    income: sumCents(countedRows.filter((row) => row.currency === currency && row.kind === "income").map((row) => row.amount_cents)),
    expense: sumCents(countedRows.filter((row) => row.currency === currency && row.kind === "expense").map((row) => row.amount_cents)),
  };
  const net = totals.income - totals.expense;
  const salaryIncome = countedRows
    .filter(
      (row) =>
        row.currency === currency &&
        row.kind === "income" &&
        row.category.trim().toLowerCase() === "salary",
    )
    .reduce((sum, row) => sum + BigInt(row.amount_cents), BigInt(0));
  const nonSalaryExpenses = countedRows
    .filter(
      (row) =>
        row.currency === currency &&
        row.kind === "expense" &&
        row.category.trim().toLowerCase() !== "salary",
    )
    .reduce((sum, row) => sum + BigInt(row.amount_cents), BigInt(0));
  return (
    <div className="total-grid">
      <Card>
        <span>{tr("Total money")}</span>
        <strong>{money(net, currency)}</strong>
      </Card>
      <Card>
        <span>{tr("Total income")}</span>
        <strong className="income">
          <ArrowDownLeft />
          {money(totals.income, currency)}
        </strong>
      </Card>
      <Card>
        <span>{tr("Total expenses")}</span>
        <strong className="expense">
          <ArrowUpRight />
          {money(totals.expense, currency)}
        </strong>
      </Card>
      <Card>
        <span>{tr("Salary income")}</span>
        <strong className="salary-income">
          <ArrowDownLeft />
          {money(salaryIncome, currency)}
        </strong>
      </Card>
      <Card>
        <span>{tr("Non-salary expenses")}</span>
        <strong className="non-salary-expense">
          <ArrowUpRight />
          {money(nonSalaryExpenses, currency)}
        </strong>
      </Card>
    </div>
  );
}
