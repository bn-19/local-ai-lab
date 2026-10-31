import { DuckDBInstance } from "@duckdb/node-api";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
export const root = path.resolve(".local-lab");
await mkdir(path.join(root, "data"), { recursive: true });
const db = await DuckDBInstance.create(path.join(root, "analytics.duckdb"), {
  threads: "4",
  memory_limit: "2GB",
});
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
const literal = (s) => "'" + String(s).replaceAll("'", "''") + "'";
const table = (id) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid dataset ID");
  return ident("d_" + id);
};
export async function query(sql) {
  const c = await db.connect();
  try {
    const r = await c.runAndReadAll(sql);
    return r.getRowObjectsJson();
  } finally {
    c.closeSync();
  }
}
export async function profile(id, name) {
  const file = path.join(root, "data", id + ".csv"),
    start = performance.now();
  await query(
    `CREATE TABLE ${table(id)} AS SELECT * FROM read_csv(${literal(file)}, header=true, sample_size=20000, max_line_size=1048576)`,
  );
  const columns = await query(`DESCRIBE ${table(id)}`);
  if (columns.length > 100) {
    await query(`DROP TABLE ${table(id)}`);
    throw Error("Maximum 100 columns supported");
  }
  const dateColumns = columns.filter((c) =>
    /DATE|TIMESTAMP/.test(c.column_type),
  );
  const coverage = dateColumns.length
    ? (
        await query(
          `SELECT ${dateColumns.flatMap((c, i) => [`CAST(min(${ident(c.column_name)}) AS VARCHAR) AS lo${i}`, `CAST(max(${ident(c.column_name)}) AS VARCHAR) AS hi${i}`]).join(",")} FROM ${table(id)}`,
        )
      )[0]
    : {};
  const [counts] = await query(
    `SELECT count(*) AS rows, ${columns.map((c, i) => `count(*)-count(${ident(c.column_name)}) AS m${i}`).join(",")} FROM ${table(id)}`,
  );
  return {
    id,
    name: name.slice(0, 160),
    bytes: (await stat(file)).size,
    rows: Number(counts.rows),
    columns: columns.map((c, i) => ({
      name: c.column_name,
      type: c.column_type,
      missing: Number(counts["m" + i]),
      ...(dateColumns.includes(c)
        ? {
            min: coverage["lo" + dateColumns.indexOf(c)],
            max: coverage["hi" + dateColumns.indexOf(c)],
          }
        : {}),
    })),
    importMs: Math.round(performance.now() - start),
    resource: {
      rssMB: Math.round(process.memoryUsage().rss / 1e6),
      peakRssMB: Math.round(process.resourceUsage().maxRSS / 1000),
      duckdbMemoryLimit: "2GB",
      threads: 4,
    },
  };
}
export function validateDefinition(dataset, task) {
  const column = (name, numeric = false) => {
    const c = dataset.columns.find((c) => c.name === name);
    if (!c) throw Error("Select a valid column");
    if (numeric && !/INT|DOUBLE|FLOAT|DECIMAL/.test(c.type))
      throw Error("Measure must be numeric");
    return ident(name);
  };
  const m = task.measure;
  if (!m || !["count", "sum", "mean", "product_sum"].includes(m.operation))
    throw Error("Choose a supported measure");
  if (m.operation !== "count") column(m.column, true);
  if (m.operation === "product_sum") column(m.column2, true);
  column(task.groupColumn);
  if (task.dateColumn) {
    const c = dataset.columns.find((c) => c.name === task.dateColumn);
    if (!c || !/DATE|TIMESTAMP/.test(c.type))
      throw Error("Choose a date/timestamp column or no date");
  }
  if (task.filterColumn) column(task.filterColumn);
  if (!["include", "exclude"].includes(task.negativePolicy))
    throw Error("Choose negative-value policy");
  return column;
}
export async function dashboard(dataset, task, filter = null) {
  const column = validateDefinition(dataset, task),
    m = task.measure,
    conditions = [];
  let expr = "count(*)";
  if (m.operation !== "count") {
    const a = column(m.column, true),
      b = m.operation === "product_sum" ? column(m.column2, true) : null;
    expr = `${m.operation === "mean" ? "avg" : "sum"}(${a}${b ? " * " + b : ""})`;
    if (task.negativePolicy === "exclude") {
      conditions.push(`${a} >= 0`);
      if (b) conditions.push(`${b} >= 0`);
    }
  }
  if (filter) {
    if (
      filter.column !== task.filterColumn ||
      typeof filter.value !== "string" ||
      filter.value.length > 1000
    )
      throw Error("Invalid filter");
    conditions.push(
      `CAST(${column(filter.column)} AS VARCHAR) = ${literal(filter.value)}`,
    );
  }
  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "",
    from = ` FROM ${table(dataset.id)}${where}`;
  const [totals] = await query(
    `SELECT count(*) AS rows, ${expr} AS value${from}`,
  );
  const group = await query(
    `SELECT CAST(${column(task.groupColumn)} AS VARCHAR) AS label, ${expr} AS value${from} GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT 12`,
  );
  const charts = [
    {
      title: `${m.operation} by ${task.groupColumn}`,
      kind: "bar",
      points: group.map((p) => ({
        label: p.label ?? "(missing)",
        value: Number(p.value ?? 0),
      })),
    },
  ];
  if (task.dateColumn) {
    const rows = await query(
      `SELECT strftime(date_trunc('month',${column(task.dateColumn)}),'%Y-%m') AS label, ${expr} AS value${from}${where ? " AND " : " WHERE "}${column(task.dateColumn)} IS NOT NULL GROUP BY 1 ORDER BY 1 LIMIT 240`,
    );
    charts.push({
      title: "Monthly trend",
      kind: "line",
      points: rows.map((p) => ({
        label: p.label,
        value: Number(p.value ?? 0),
      })),
    });
  } else {
    const rows = await query(
      `SELECT CAST(${column(task.groupColumn)} AS VARCHAR) AS label,count(*) AS value${from} GROUP BY 1 ORDER BY value DESC LIMIT 12`,
    );
    charts.push({
      title: "Rows by group",
      kind: "bar",
      points: rows.map((p) => ({
        label: p.label ?? "(missing)",
        value: Number(p.value),
      })),
    });
  }
  const values = task.filterColumn
    ? await query(
        `SELECT DISTINCT CAST(${column(task.filterColumn)} AS VARCHAR) AS value FROM ${table(dataset.id)} WHERE ${column(task.filterColumn)} IS NOT NULL ORDER BY 1 LIMIT 100`,
      )
    : [];
  if (task.plan?.chart === "line" && task.dateColumn) charts.reverse();
  return {
    explanation: task.plan?.explanation,
    kpis: [
      {
        label:
          m.operation === "count"
            ? "Rows"
            : `${m.operation}: ${m.column}${m.column2 ? " × " + m.column2 : ""}`,
        value: Number(totals.value ?? 0),
      },
      { label: "Included rows", value: Number(totals.rows) },
    ],
    charts,
    filters: task.filterColumn
      ? [{ column: task.filterColumn, values: values.map((r) => r.value) }]
      : [],
    source: {
      name: dataset.name,
      rows: dataset.rows,
      filteredRows: Number(totals.rows),
      measure: m,
      negativePolicy: task.negativePolicy,
      dateColumn: task.dateColumn,
      groupColumn: task.groupColumn,
    },
    model: task.model,
    configuration: task.configuration ?? "baseline",
  };
}

// Only these trusted SQL templates execute a validated adapter plan.
export async function liveReport(dataset,mapping,plan,exclusions){
  const {reportSQL}=await import('./live-reporting.mjs');
  if(plan.metric==='clarify')return {clarification:'Cost data is required to calculate profit or margin. No revenue value was substituted.'};
  const sql=reportSQL(dataset.id,mapping,plan,exclusions);
  const [summary]=await query(sql.summary);
  const revenue=summary.revenue===null?null:Number(summary.revenue),orders=Number(summary.orders);
  let answer;
  if(plan.metric==='revenue')answer=revenue;
  if(plan.metric==='orders')answer=orders;
  if(plan.metric==='average_order_value')answer=orders?revenue/orders:null;
  if(plan.metric==='top_products')answer=(await query(sql.products)).map(r=>({product:r.product,revenue:Number(r.revenue)}));
  return {answer,includedRows:Number(summary.includedRows),sourceRows:dataset.rows,orders,excludedRows:dataset.rows-Number(summary.includedRows),numericMethod:'Double precision; independently checked against Decimal on the public retail fixture.',missingPolicy:'Rows missing any mapped field are excluded.'};
}

export async function candyReport(dataset,plan){
 const {candySQL,validateCandyPlan}=await import('./candy.mjs');validateCandyPlan(plan);
 if(plan.operation==='clarify')return {clarification:'This dataset has matchup win rates and relative sugar/price percentiles. It cannot supply grams, calories, dollar prices, sales, allergy safety or photo identification.'};
 const rows=await query(candySQL(dataset.id,plan));
 return {answer:['mean','count'].includes(plan.operation)?Number(rows[0].value):rows.map(r=>({label:plan.operation==='compare'?(r.label==='1'?'Chocolate':'Non-chocolate'):r.label,value:Number(r.value)})),sourceRows:dataset.rows,unit:plan.operation==='count'?'entries':plan.measure==='winpercent'?'matchup win percentage (0–100)':'relative percentile (0–1)',source:'FiveThirtyEight candy-power-ranking; CC BY 4.0'};
}
