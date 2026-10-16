import { describe, expect, it } from "vitest";
import { dictFor, interpolate } from "./i18n";

// Both dictionaries must have exactly the same key structure, so no string is
// ever missing in one language.

function flatten(obj: unknown, prefix = ""): string[] {
  if (typeof obj === "string") return [prefix];
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    keys.push(...flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return keys.sort();
}

describe("i18n dictionaries", () => {
  it("English and Spanish have identical key structures", () => {
    expect(flatten(dictFor("es"))).toEqual(flatten(dictFor("en")));
  });

  it("falls back to English for unknown languages", () => {
    expect(dictFor("fr")).toBe(dictFor("en"));
    expect(dictFor(undefined)).toBe(dictFor("en"));
  });

  it("interpolates placeholders", () => {
    expect(interpolate("{n} of {total}", { n: 3, total: 7 })).toBe("3 of 7");
    expect(interpolate("PID {pid}", {})).toBe("PID {pid}");
  });
});
