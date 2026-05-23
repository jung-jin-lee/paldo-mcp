import type { Persona } from "paldo-core";

export interface ToolTextResult {
  [x: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(value: unknown): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function error(message: string): ToolTextResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function summarizePersonas(personas: Persona[]): string {
  // Compact one-line summary per persona, useful for at-a-glance logs.
  return personas
    .map(
      (p) =>
        `[${p.uuid.slice(0, 8)}] ${p.sex} ${p.age}세 / ${p.province} ${p.district} / ${p.occupation}`,
    )
    .join("\n");
}
