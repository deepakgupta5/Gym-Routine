import { describe, expect, it } from "vitest";
import { computePerformedAtFromSets } from "../../src/lib/db/logs";

describe("computePerformedAtFromSets", () => {
  it("uses earliest top set for non-Friday", () => {
    const rows = [
      { performed_at: "2026-02-09T10:00:00Z", set_type: "backoff" },
      { performed_at: "2026-02-09T10:05:00Z", set_type: "top" },
      { performed_at: "2026-02-09T09:55:00Z", set_type: "top" },
    ];
    const result = computePerformedAtFromSets("Mon", rows);
    expect(result).toBe("2026-02-09T09:55:00.000Z");
  });

  it("uses earliest set for Friday", () => {
    const rows = [
      { performed_at: "2026-02-14T10:00:00Z", set_type: "accessory" },
      { performed_at: "2026-02-14T09:50:00Z", set_type: "accessory" },
    ];
    const result = computePerformedAtFromSets("Fri", rows);
    expect(result).toBe("2026-02-14T09:50:00.000Z");
  });

  it("returns null when no qualifying sets", () => {
    const rows = [
      { performed_at: "2026-02-09T10:00:00Z", set_type: "backoff" },
    ];
    const result = computePerformedAtFromSets("Tue", rows);
    expect(result).toBe(null);
  });
});
