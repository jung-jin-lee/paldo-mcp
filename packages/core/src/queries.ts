import { LIST, VARCHAR, listValue } from "@duckdb/node-api";
import {
  assertDatasetPresent,
  getConnection,
  getParquetGlob,
} from "./db.js";
import { SCHEMA } from "./schema.js";
import type {
  PanelOptions,
  Persona,
  SampleFilters,
  SampleOptions,
  SchemaInfo,
} from "./types.js";

type ParamBag = Record<string, unknown>;
type TypeBag = Record<string, unknown>;

interface WhereClause {
  sql: string;
  params: ParamBag;
  types: TypeBag;
}

function toArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function addList(
  params: ParamBag,
  types: TypeBag,
  key: string,
  values: string[],
): void {
  params[key] = listValue(values);
  types[key] = LIST(VARCHAR);
}

function buildWhere(filters: SampleFilters | undefined): WhereClause {
  if (!filters) return { sql: "", params: {}, types: {} };

  const clauses: string[] = [];
  const params: ParamBag = {};
  const types: TypeBag = {};

  const provinces = toArray(filters.province);
  if (provinces?.length) {
    clauses.push("list_contains($provinces, province)");
    addList(params, types, "provinces", provinces);
  }

  const districts = toArray(filters.district);
  if (districts?.length) {
    clauses.push("list_contains($districts, district)");
    addList(params, types, "districts", districts);
  }

  if (filters.sex !== undefined) {
    clauses.push("sex = $sex");
    params.sex = filters.sex;
  }

  if (filters.age_range !== undefined) {
    const [lo, hi] = filters.age_range;
    clauses.push("age BETWEEN $age_min AND $age_max");
    params.age_min = lo;
    params.age_max = hi;
  }

  const educations = toArray(filters.education_level);
  if (educations?.length) {
    clauses.push("list_contains($educations, education_level)");
    addList(params, types, "educations", educations);
  }

  if (filters.occupation_contains !== undefined) {
    clauses.push("occupation ILIKE $occ_pattern");
    params.occ_pattern = `%${filters.occupation_contains}%`;
  }

  const maritals = toArray(filters.marital_status);
  if (maritals?.length) {
    clauses.push("list_contains($maritals, marital_status)");
    addList(params, types, "maritals", maritals);
  }

  const families = toArray(filters.family_type);
  if (families?.length) {
    clauses.push("list_contains($families, family_type)");
    addList(params, types, "families", families);
  }

  const housings = toArray(filters.housing_type);
  if (housings?.length) {
    clauses.push("list_contains($housings, housing_type)");
    addList(params, types, "housings", housings);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    types,
  };
}

function clampN(n: number, max = 20): number {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`n must be a positive integer (1-${max}), got ${n}`);
  }
  return Math.min(n, max);
}

function seedSetupSql(seed: number | undefined): string {
  if (seed === undefined) return "";
  const normalized = ((seed % 1_000_000) / 1_000_000).toFixed(6);
  return `SELECT setseed(${normalized}); `;
}

export async function sample(opts: SampleOptions): Promise<Persona[]> {
  assertDatasetPresent();
  const n = clampN(opts.n);
  const conn = await getConnection();
  const { sql: where, params, types } = buildWhere(opts.filters);

  const sql =
    `${seedSetupSql(opts.seed)}` +
    `SELECT * FROM read_parquet($parquet) ` +
    `${where} ORDER BY random() LIMIT ${n}`;

  const reader = await conn.runAndReadAll(
    sql,
    { parquet: getParquetGlob(), ...params },
    { parquet: VARCHAR, ...types },
  );
  return reader.getRowObjectsJson() as unknown as Persona[];
}

export async function getByUuid(uuid: string): Promise<Persona | null> {
  assertDatasetPresent();
  const conn = await getConnection();
  const reader = await conn.runAndReadAll(
    `SELECT * FROM read_parquet($parquet) WHERE uuid = $uuid LIMIT 1`,
    { parquet: getParquetGlob(), uuid },
    { parquet: VARCHAR, uuid: VARCHAR },
  );
  const rows = reader.getRowObjectsJson() as unknown as Persona[];
  return rows[0] ?? null;
}

/**
 * Fetch many personas by UUID, optionally intersected with the same
 * categorical filters that `sample` supports. Order of the returned array is
 * NOT guaranteed to match the input — callers that need order (e.g. semantic
 * search ranking) should re-index by uuid themselves.
 */
export async function getByUuids(
  uuids: string[],
  filters?: SampleFilters,
): Promise<Persona[]> {
  if (uuids.length === 0) return [];
  assertDatasetPresent();
  const conn = await getConnection();
  const { sql: where, params, types } = buildWhere(filters);

  // Compose the uuid IN clause with any caller-supplied WHERE.
  const uuidClause = "list_contains($uuids, uuid)";
  const whereSql = where ? `${where} AND ${uuidClause}` : `WHERE ${uuidClause}`;

  const reader = await conn.runAndReadAll(
    `SELECT * FROM read_parquet($parquet) ${whereSql}`,
    {
      parquet: getParquetGlob(),
      uuids: listValue(uuids),
      ...params,
    },
    {
      parquet: VARCHAR,
      uuids: LIST(VARCHAR),
      ...types,
    },
  );
  return reader.getRowObjectsJson() as unknown as Persona[];
}

function stratifyExpression(dim: NonNullable<PanelOptions["stratify_by"]>): string {
  switch (dim) {
    case "age_decade":
      return "(age / 10) * 10";
    case "province":
    case "education_level":
    case "sex":
      return dim;
  }
}

export async function panel(opts: PanelOptions): Promise<Persona[]> {
  assertDatasetPresent();
  const n = clampN(opts.n);
  const conn = await getConnection();
  const { sql: where, params } = buildWhere(opts.filters);

  if (!opts.stratify_by) {
    return sample({ filters: opts.filters, n, seed: opts.seed });
  }

  const stratumExpr = stratifyExpression(opts.stratify_by);
  const { sql: where2, params: panelParams, types: panelTypes } = buildWhere(
    opts.filters,
  );
  // Per-stratum round-robin: assign row_number within each stratum, take the
  // first `ceil(n / stratum_count)` per stratum, then trim to n.
  const sql =
    `${seedSetupSql(opts.seed)}` +
    `WITH numbered AS (
       SELECT *,
         row_number() OVER (PARTITION BY ${stratumExpr} ORDER BY random()) AS rn,
         ${stratumExpr} AS _stratum
       FROM read_parquet($parquet)
       ${where2}
     ),
     ranked AS (
       SELECT * FROM numbered
       ORDER BY rn, random()
     )
     SELECT * EXCLUDE (rn, _stratum)
     FROM ranked
     LIMIT ${n}`;

  const reader = await conn.runAndReadAll(
    sql,
    { parquet: getParquetGlob(), ...panelParams },
    { parquet: VARCHAR, ...panelTypes },
  );
  return reader.getRowObjectsJson() as unknown as Persona[];
}

export function describeSchema(): SchemaInfo {
  return SCHEMA;
}

export type StatsDimension =
  | "province"
  | "district"
  | "sex"
  | "age_decade"
  | "marital_status"
  | "education_level"
  | "housing_type"
  | "family_type"
  | "occupation";

export interface StatsBucket {
  value: string;
  count: number;
}

function dimensionExpression(dim: StatsDimension): string {
  // age_decade is the only synthetic dimension. We use `age - age % 10` to
  // guarantee integer arithmetic — DuckDB's `/` is float by default, which
  // produces 50.0, 51.0, 52.0, etc. instead of the intended 50/60/70 buckets.
  // We also append "대" so the labels read naturally ("20대", "30대"…).
  return dim === "age_decade"
    ? "((age - age % 10)::VARCHAR || '대')"
    : dim;
}

/**
 * Group-by aggregation over the persona dataset. Returns top buckets by count.
 * Useful for sanity-checking "do I have enough of X?" before sampling.
 *
 * Example: `stats({ group_by: 'province', filters: { age_range: [30, 39] } })`
 * returns province-by-province population of 30-somethings.
 */
export async function stats(opts: {
  group_by: StatsDimension;
  filters?: SampleFilters;
  limit?: number;
}): Promise<StatsBucket[]> {
  assertDatasetPresent();
  const conn = await getConnection();
  const { sql: where, params, types } = buildWhere(opts.filters);
  const expr = dimensionExpression(opts.group_by);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 300);

  const reader = await conn.runAndReadAll(
    `SELECT ${expr} AS value, COUNT(*) AS count
     FROM read_parquet($parquet) ${where}
     GROUP BY value
     ORDER BY count DESC
     LIMIT ${limit}`,
    { parquet: getParquetGlob(), ...params },
    { parquet: VARCHAR, ...types },
  );
  const rows = reader.getRowObjectsJson() as unknown as Array<{
    value: string;
    count: number | bigint;
  }>;
  return rows.map((r) => ({ value: r.value, count: Number(r.count) }));
}

export async function countMatching(
  filters: SampleFilters | undefined,
): Promise<number> {
  assertDatasetPresent();
  const conn = await getConnection();
  const { sql: where, params, types } = buildWhere(filters);
  const reader = await conn.runAndReadAll(
    `SELECT COUNT(*) AS n FROM read_parquet($parquet) ${where}`,
    { parquet: getParquetGlob(), ...params },
    { parquet: VARCHAR, ...types },
  );
  const row = reader.getRowObjectsJson()[0] as { n: number | bigint };
  return Number(row.n);
}
