import { describe, expect, it } from "vitest";
import { formatCpu, formatMemory, formatUptime, shortPath, truncateCmd } from "./format";

describe("formatUptime", () => {
  it("returns N/A for missing values", () => {
    expect(formatUptime(null)).toBe("N/A");
    expect(formatUptime(undefined)).toBe("N/A");
    expect(formatUptime(-5)).toBe("N/A");
  });

  it("formats seconds and minutes", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(45)).toBe("45s");
    expect(formatUptime(125)).toBe("2m 5s");
  });

  it("formats hours and days", () => {
    expect(formatUptime(3600)).toBe("1h 0m");
    expect(formatUptime(7320)).toBe("2h 2m");
    expect(formatUptime(3 * 86400 + 5 * 3600)).toBe("3d 5h");
  });
});

describe("formatMemory", () => {
  it("formats MB under 1 GB", () => {
    expect(formatMemory(512)).toBe("512 MB");
  });
  it("formats GB above 1 GB", () => {
    expect(formatMemory(1536)).toBe("1.5 GB");
  });
  it("returns N/A for missing values", () => {
    expect(formatMemory(null)).toBe("N/A");
  });
});

describe("formatCpu", () => {
  it("formats percentages", () => {
    expect(formatCpu(12.34)).toBe("12.3%");
    expect(formatCpu(0)).toBe("0.0%");
  });
  it("returns N/A for missing values", () => {
    expect(formatCpu(null)).toBe("N/A");
  });
});

describe("truncateCmd", () => {
  it("keeps short commands intact", () => {
    expect(truncateCmd("node server.js", 96)).toBe("node server.js");
  });
  it("truncates long commands with ellipsis", () => {
    const long = "x".repeat(200);
    expect(truncateCmd(long, 96)).toHaveLength(96);
    expect(truncateCmd(long, 96)).toMatch(/…$/);
  });
});

describe("shortPath", () => {
  it("keeps short paths intact", () => {
    expect(shortPath("D:\\proj", 48)).toBe("D:\\proj");
  });
  it("shortens long paths from the tail", () => {
    const p = "D:\\" + "a\\".repeat(30) + "end";
    expect(shortPath(p, 20)).toMatch(/^…/);
    expect(shortPath(p, 20)).toMatch(/end$/);
  });
});
