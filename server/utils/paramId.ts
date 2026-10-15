/**
 * Parse a `:id` route parameter.
 *
 * `Number('bulk')` is NaN, and NaN sent to Postgres raises a type error that
 * surfaces as a 500. A path like /contacts/bulk must be a plain 404, so every
 * parameterised route validates before touching the database.
 */
export function parseId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
