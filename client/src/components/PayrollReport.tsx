import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { downloadBlob, notifyWorkChanged, useWorkChanged } from "../lib/work";
import { PersonSearch } from "./PersonSearch";

interface PayPeriod {
  id: number;
  type: "BIWEEKLY" | "MONTHLY";
  startDate: string;
  endDate: string;
  status: "OPEN" | "PROCESSING" | "CLOSED";
  reportRowCount: number;
}

/** One line per person per charge account, as returned by /reports/payroll. */
interface ReportLine {
  employeeId: number;
  name: string;
  firstName: string;
  lastName: string;
  preferredName: string;
  payType: "BIWEEKLY" | "MONTHLY";
  role: string;
  department: string;
  departmentCode: string;
  chargeAccount: string;
  chargeAccountName: string;
  hourlyRate: string;
  regularHours: string;
  regularPay: string;
  overtimeHours: string;
  overtimePay: string;
  totalHours: string;
  totalPay: string;
  payrollStatus: string;
  reviewStatus: string;
}

/** Hours and pay kept in minutes and cents so totals add up exactly. */
interface Amounts {
  regularMinutes: number;
  regularCents: number;
  overtimeMinutes: number;
  overtimeCents: number;
}

interface Row extends Amounts {
  key: string;
  employeeIds: number[];
  name: string;
  department: string;
  chargeAccount: string;
  chargeAccountName: string;
  hourlyRate: string;
  reviewStatus: string;
}

type GroupBy = "line" | "person" | "department" | "account";
type SortKey = "name" | "department" | "chargeAccount" | "hourlyRate" | "regularHours" | "regularPay" | "overtimeHours" | "overtimePay" | "totalHours" | "totalPay";

const cents = (value: string) => Math.round(Number(value || 0) * 100);
const minutes = (value: string) => Math.round(Number(value || 0) * 60);
const dollars = (value: number) => `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hours = (value: number) => (value / 60).toFixed(2);
const totalMinutes = (row: Amounts) => row.regularMinutes + row.overtimeMinutes;
const totalCents = (row: Amounts) => row.regularCents + row.overtimeCents;

function sumAmounts(rows: Amounts[]): Amounts {
  return rows.reduce(
    (sum, row) => ({
      regularMinutes: sum.regularMinutes + row.regularMinutes,
      regularCents: sum.regularCents + row.regularCents,
      overtimeMinutes: sum.overtimeMinutes + row.overtimeMinutes,
      overtimeCents: sum.overtimeCents + row.overtimeCents,
    }),
    { regularMinutes: 0, regularCents: 0, overtimeMinutes: 0, overtimeCents: 0 }
  );
}

const lineAmounts = (line: ReportLine): Amounts => ({
  regularMinutes: minutes(line.regularHours),
  regularCents: cents(line.regularPay),
  overtimeMinutes: minutes(line.overtimeHours),
  overtimeCents: cents(line.overtimePay),
});

const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
const joinDistinct = (values: string[]) => distinct(values).join(", ");

function groupLines(lines: ReportLine[], groupBy: GroupBy): Row[] {
  const keyOf = (line: ReportLine, index: number) =>
    groupBy === "line" ? `${line.employeeId}-${line.chargeAccount}-${index}`
      : groupBy === "person" ? String(line.employeeId)
        : groupBy === "department" ? line.department || "No department"
          : line.chargeAccount || "Unassigned";
  const groups = new Map<string, ReportLine[]>();
  lines.forEach((line, index) => {
    const key = keyOf(line, index);
    groups.set(key, [...(groups.get(key) ?? []), line]);
  });
  return [...groups.entries()].map(([key, group]) => {
    const people = distinct(group.map((line) => line.name));
    return {
      key,
      employeeIds: [...new Set(group.map((line) => line.employeeId))],
      name: groupBy === "department" || groupBy === "account" ? `${people.length} ${people.length === 1 ? "person" : "people"}` : group[0].name,
      department: groupBy === "department" ? key : joinDistinct(group.map((line) => line.department)),
      chargeAccount: groupBy === "account" ? key : joinDistinct(group.map((line) => line.chargeAccount)),
      chargeAccountName: joinDistinct(group.map((line) => line.chargeAccountName)),
      hourlyRate: joinDistinct(group.map((line) => line.hourlyRate)),
      reviewStatus: joinDistinct(group.map((line) => line.reviewStatus)),
      ...sumAmounts(group.map(lineAmounts)),
    };
  });
}

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "department", label: "Home department" },
  { key: "chargeAccount", label: "Charge account" },
  { key: "hourlyRate", label: "Rate", numeric: true },
  { key: "regularHours", label: "Regular hrs", numeric: true },
  { key: "regularPay", label: "Regular pay", numeric: true },
  { key: "overtimeHours", label: "Overtime hrs", numeric: true },
  { key: "overtimePay", label: "Overtime pay", numeric: true },
  { key: "totalHours", label: "Total hrs", numeric: true },
  { key: "totalPay", label: "Total pay", numeric: true },
];

function sortValue(row: Row, key: SortKey): string | number {
  switch (key) {
    case "hourlyRate": return Number(row.hourlyRate.split(",")[0] || 0);
    case "regularHours": return row.regularMinutes;
    case "regularPay": return row.regularCents;
    case "overtimeHours": return row.overtimeMinutes;
    case "overtimePay": return row.overtimeCents;
    case "totalHours": return totalMinutes(row);
    case "totalPay": return totalCents(row);
    default: return row[key].toLowerCase();
  }
}

function cellValues(row: Row) {
  return {
    name: row.name,
    department: row.department || "—",
    chargeAccount: row.chargeAccount || "Unassigned",
    hourlyRate: row.hourlyRate ? `$${row.hourlyRate}` : "Salary",
    regularHours: hours(row.regularMinutes),
    regularPay: dollars(row.regularCents),
    overtimeHours: hours(row.overtimeMinutes),
    overtimePay: dollars(row.overtimeCents),
    totalHours: hours(totalMinutes(row)),
    totalPay: dollars(totalCents(row)),
  };
}

function periodLabel(period: PayPeriod) {
  return `${period.type === "BIWEEKLY" ? "Bi-weekly" : "Monthly"} · ${new Date(period.startDate).toLocaleDateString()} – ${new Date(period.endDate).toLocaleDateString()}`;
}

export function PayrollReport({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const Heading = embedded ? "h3" : "h2";
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [payPeriodId, setPayPeriodId] = useState("");
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [peopleFilter, setPeopleFilter] = useState<number[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("person");
  const [sort, setSort] = useState<{ key: SortKey; direction: "ascending" | "descending" }>({ key: "name", direction: "ascending" });
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const [version, setVersion] = useState(0);
  // "Please review the payroll report" requests stay open until marked reviewed here.
  const [reviewRequests, setReviewRequests] = useState<{ id: number; senderName: string }[]>([]);

  useEffect(() => {
    api.get<{ id: number; type: string; requiresAction: boolean; senderName: string }[]>("/notifications")
      .then((items) => setReviewRequests(items.filter((item) => item.type === "REPORT_READY" && item.requiresAction)))
      .catch(() => setReviewRequests([]));
  }, []);

  async function markReviewed() {
    try {
      await Promise.all(reviewRequests.map((request) => api.patch(`/notifications/${request.id}`, { read: true, dismissed: true })));
      setReviewRequests([]);
      notifyWorkChanged();
      setMessage("Report marked as reviewed.");
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not mark the report reviewed.");
    }
  }

  useEffect(() => {
    api.get<PayPeriod[]>("/payroll/periods").then((data) => {
      setPeriods(data);
      const firstReady = data.find((period) => period.reportRowCount > 0);
      setPayPeriodId((current) => current || (firstReady ? String(firstReady.id) : ""));
      if (!firstReady) setMessage("No pay periods have generated payroll yet.");
    }).catch(() => setMessage("Could not load pay periods."));
  }, [version]);
  // Generating or reviewing payroll elsewhere on the page changes the numbers.
  useWorkChanged(() => setVersion((value) => value + 1), { poll: false });

  useEffect(() => {
    if (!payPeriodId) return;
    let active = true;
    setLoading(true);
    setMessage("");
    api.get<ReportLine[]>(`/reports/payroll?payPeriodId=${payPeriodId}&format=json`).then((data) => {
      if (!active) return;
      setLines(data);
      setCompareIds((ids) => ids.filter((id) => data.some((line) => line.employeeId === id)));
      setMessage(data.length ? `${data.length} report line${data.length === 1 ? "" : "s"} loaded.` : "No payroll data is available for this pay period.");
    }).catch((err) => {
      if (active) setMessage(err instanceof ApiError ? err.message : "Could not load the payroll report.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [payPeriodId, version]);

  const people = useMemo(() => {
    const byId = new Map<number, ReportLine>();
    for (const line of lines) if (!byId.has(line.employeeId)) byId.set(line.employeeId, line);
    return [...byId.values()].map((line) => ({
      id: line.employeeId,
      firstName: line.firstName,
      lastName: line.lastName,
      preferredName: line.preferredName || null,
      detail: [line.department, line.chargeAccount].filter(Boolean).join(" · "),
    }));
  }, [lines]);
  const departments = useMemo(() => distinct(lines.map((line) => line.department)), [lines]);
  const accounts = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of lines) if (line.chargeAccount) map.set(line.chargeAccount, line.chargeAccountName);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [lines]);

  const filtered = useMemo(() => lines.filter((line) =>
    (!peopleFilter.length || peopleFilter.includes(line.employeeId)) &&
    (!departmentFilter || line.department === departmentFilter) &&
    (!accountFilter || line.chargeAccount === accountFilter)
  ), [lines, peopleFilter, departmentFilter, accountFilter]);

  const rows = useMemo(() => {
    const grouped = groupLines(filtered, groupBy);
    const factor = sort.direction === "ascending" ? 1 : -1;
    return grouped.sort((a, b) => {
      const left = sortValue(a, sort.key);
      const right = sortValue(b, sort.key);
      return (left < right ? -1 : left > right ? 1 : 0) * factor || a.name.localeCompare(b.name);
    });
  }, [filtered, groupBy, sort]);
  const totals = sumAmounts(rows);
  const personRows = groupBy === "line" || groupBy === "person";

  function toggleSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "ascending" ? "descending" : "ascending" }));
  }

  function toggleCompare(employeeId: number) {
    setCompareIds((ids) => (ids.includes(employeeId) ? ids.filter((id) => id !== employeeId) : [...ids, employeeId]));
  }

  function downloadCsv() {
    const header = ["Name", "Home department", "Charge account", "Charge account name", "Hourly rate", "Regular hours", "Regular pay", "Overtime hours", "Overtime pay", "Total hours", "Total pay", "Review status"];
    const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    const body = rows.map((row) => [
      row.name, row.department, row.chargeAccount, row.chargeAccountName, row.hourlyRate,
      hours(row.regularMinutes), (row.regularCents / 100).toFixed(2), hours(row.overtimeMinutes), (row.overtimeCents / 100).toFixed(2),
      hours(totalMinutes(row)), (totalCents(row) / 100).toFixed(2), row.reviewStatus,
    ].map(escape).join(","));
    const footer = ["Total", "", "", "", "", hours(totals.regularMinutes), (totals.regularCents / 100).toFixed(2), hours(totals.overtimeMinutes), (totals.overtimeCents / 100).toFixed(2), hours(totalMinutes(totals)), (totalCents(totals) / 100).toFixed(2), ""].join(",");
    downloadBlob(new Blob([[header.join(","), ...body, footer].join("\r\n")], { type: "text/csv" }), `payroll-report-${payPeriodId}.csv`);
    setMessage("CSV of the current view downloaded.");
  }

  const compared = useMemo(() => compareIds.map((id) => {
    const personLines = lines.filter((line) => line.employeeId === id);
    return { id, lines: personLines, row: groupLines(personLines, "person")[0] };
  }).filter((entry) => entry.row), [compareIds, lines]);

  return (
    <section aria-labelledby="report-heading" className={embedded ? "talon-report-panel payroll-report" : "card payroll-report supervisor-report-center"}>
      <Heading id="report-heading" tabIndex={-1}>Payroll Report</Heading>
      <p className="payroll-report__intro">
        {isAdmin ? "Every department, with hours and pay split by charge account." : "Your students, with hours and pay split by charge account."} Filter, sort, and compare people here; download a CSV of exactly what you see.
      </p>

      {reviewRequests.length > 0 && (
        <div className="payroll-report__request">
          <p><strong>{reviewRequests[0].senderName}</strong> asked you to review this payroll report.</p>
          <button type="button" onClick={markReviewed} disabled={!lines.length}>Mark report reviewed</button>
        </div>
      )}

      <div className="payroll-report__filters">
        <div className="form-row">
          <label htmlFor="report-period">Pay period</label>
          <select id="report-period" value={payPeriodId} onChange={(event) => setPayPeriodId(event.target.value)}>
            <option value="">Select a pay period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id} disabled={period.reportRowCount === 0}>
                {periodLabel(period)} · {period.reportRowCount === 0 ? "No payroll data" : `${period.reportRowCount} employee${period.reportRowCount === 1 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </div>
        <PersonSearch label="People" people={people} value={peopleFilter} onChange={setPeopleFilter} multiple placeholder="Add people by name" />
        <div className="form-row">
          <label htmlFor="report-department">Home department</label>
          <select id="report-department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
            <option value="">All departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="report-account">Charge account</label>
          <select id="report-account" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
            <option value="">All charge accounts</option>
            {accounts.map(([code, name]) => <option key={code} value={code}>{code} – {name}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="report-group">Group rows by</label>
          <select id="report-group" value={groupBy} onChange={(event) => setGroupBy(event.target.value as GroupBy)}>
            <option value="person">Person</option>
            <option value="line">Person and charge account</option>
            <option value="department">Home department</option>
            <option value="account">Charge account</option>
          </select>
        </div>
      </div>

      <div className="payroll-report__actions">
        <button type="button" className="talon-report-csv" onClick={downloadCsv} disabled={!rows.length}>Download CSV</button>
        {personRows && <button type="button" onClick={() => setComparing(true)} disabled={compareIds.length < 2}>Compare selected ({compareIds.length})</button>}
        {(peopleFilter.length > 0 || departmentFilter || accountFilter) && (
          <button type="button" className="button--secondary" onClick={() => { setPeopleFilter([]); setDepartmentFilter(""); setAccountFilter(""); }}>Clear filters</button>
        )}
      </div>
      <p role="status" aria-live="polite" className="talon-report-status">{loading ? "Loading report…" : message}</p>

      {rows.length > 0 && (
        <div className="table-scroll payroll-report__table" role="region" aria-label="Payroll report table" tabIndex={0}>
          <table>
            <caption className="sr-only">Payroll report, sortable. {rows.length} rows.</caption>
            <thead>
              <tr>
                {personRows && <th scope="col"><span className="sr-only">Compare</span></th>}
                {COLUMNS.map((column) => (
                  <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction : "none"} className={column.numeric ? "numeric" : undefined}>
                    <button type="button" className="sort-button" onClick={() => toggleSort(column.key)}>
                      {column.label}
                      <span aria-hidden="true" className="sort-button__arrow">{sort.key === column.key ? (sort.direction === "ascending" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  </th>
                ))}
                <th scope="col">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const values = cellValues(row);
                const employeeId = row.employeeIds[0];
                return (
                  <tr key={row.key}>
                    {personRows && (
                      <td>
                        <input type="checkbox" className="payroll-report__compare" checked={compareIds.includes(employeeId)} onChange={() => toggleCompare(employeeId)} aria-label={`Compare ${row.name}`} />
                      </td>
                    )}
                    {COLUMNS.map((column) => column.key === "name"
                      ? <th key={column.key} scope="row">{values.name}</th>
                      : <td key={column.key} className={column.numeric ? "numeric" : undefined} title={column.key === "chargeAccount" ? row.chargeAccountName : undefined}>{values[column.key]}</td>)}
                    <td>{row.reviewStatus}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                {personRows && <td />}
                <th scope="row">Total</th>
                <td /><td /><td />
                <td className="numeric">{hours(totals.regularMinutes)}</td>
                <td className="numeric">{dollars(totals.regularCents)}</td>
                <td className="numeric">{hours(totals.overtimeMinutes)}</td>
                <td className="numeric">{dollars(totals.overtimeCents)}</td>
                <td className="numeric">{hours(totalMinutes(totals))}</td>
                <td className="numeric">{dollars(totalCents(totals))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {comparing && compared.length >= 2 && (
        <PayComparison people={compared} onClose={() => setComparing(false)} />
      )}
    </section>
  );
}

/** Side-by-side line items, with cells that differ from the first person highlighted. */
function PayComparison({ people, onClose }: { people: { id: number; lines: ReportLine[]; row: Row }[]; onClose: () => void }) {
  const items: { label: string; value: (entry: (typeof people)[number]) => string }[] = [
    { label: "Home department", value: ({ row }) => row.department || "—" },
    { label: "Pay type", value: ({ lines }) => (lines[0].payType === "BIWEEKLY" ? "Bi-weekly" : "Monthly") },
    { label: "Hourly rate", value: ({ row }) => (row.hourlyRate ? `$${row.hourlyRate}` : "Salary") },
    { label: "Charge accounts", value: ({ lines }) => lines.map((line) => `${line.chargeAccount || "Unassigned"}: ${line.totalHours} hrs`).join("; ") },
    { label: "Regular hours", value: ({ row }) => hours(row.regularMinutes) },
    { label: "Regular pay", value: ({ row }) => dollars(row.regularCents) },
    { label: "Overtime hours", value: ({ row }) => hours(row.overtimeMinutes) },
    { label: "Overtime pay", value: ({ row }) => dollars(row.overtimeCents) },
    { label: "Total hours", value: ({ row }) => hours(totalMinutes(row)) },
    { label: "Total pay", value: ({ row }) => dollars(totalCents(row)) },
    { label: "Review status", value: ({ row }) => row.reviewStatus },
  ];
  const differing = items.filter((item) => new Set(people.map(item.value)).size > 1).map((item) => item.label);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section className="pay-comparison" aria-labelledby="pay-comparison-heading">
      <div className="pay-comparison__header">
        <h3 id="pay-comparison-heading" tabIndex={-1} ref={heading}>Side-by-side comparison</h3>
        <button type="button" className="button--secondary" onClick={onClose}>Close comparison</button>
      </div>
      <p className="pay-comparison__summary">
        {differing.length ? <>Different: <strong>{differing.join(", ")}</strong>. Highlighted cells differ from {people[0].row.name}.</> : "Every line item matches."}
      </p>
      <div className="table-scroll" role="region" aria-label="Pay comparison" tabIndex={0}>
        <table>
          <thead>
            <tr><th scope="col">Line item</th>{people.map((entry) => <th key={entry.id} scope="col">{entry.row.name}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const base = item.value(people[0]);
              return (
                <tr key={item.label} className={differing.includes(item.label) ? "pay-comparison__row--differs" : undefined}>
                  <th scope="row">{item.label}</th>
                  {people.map((entry, index) => {
                    const value = item.value(entry);
                    const differs = index > 0 && value !== base;
                    return <td key={entry.id} className={differs ? "pay-comparison__cell--differs" : undefined}>{value}{differs && <span className="sr-only"> (different)</span>}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
