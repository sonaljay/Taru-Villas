import { describe, it, expect } from "vitest";
import {
  reportTemplates,
  templateSchema,
  scoreSummary,
  validateAnswers,
} from "./model";
describe("category report templates", () => {
  it("preserves all four source prompt and scorecard counts", () => {
    expect(
      reportTemplates.map((t) => [
        t.sections.length,
        t.questions.filter((q) => q.kind === "inspection").length,
        t.questions.filter((q) => q.kind === "score").length,
      ]),
    ).toEqual([
      [5, 14, 5],
      [5, 10, 6],
      [4, 11, 5],
      [7, 24, 6],
    ]);
    for (const template of reportTemplates)
      expect(templateSchema.safeParse(template).success).toBe(true);
  });
  it("excludes N/A and incomplete ratings from calculated average", () => {
    expect(scoreSummary([5, "na", 3, null])).toEqual({
      total: 8,
      possible: 10,
      average: 4,
      rated: 2,
      unanswered: 1,
    });
    expect(scoreSummary(["na"])).toEqual({
      total: 0,
      possible: 0,
      average: null,
      rated: 0,
      unanswered: 0,
    });
  });
  it("rejects duplicate template question ids", () => {
    const t = structuredClone(reportTemplates[0]);
    t.questions[1].id = t.questions[0].id;
    expect(templateSchema.safeParse(t).success).toBe(false);
  });
  it("requires full answers for submission but allows incomplete drafts", () => {
    expect(() => validateAnswers(reportTemplates[0], [], false)).not.toThrow();
    expect(() => validateAnswers(reportTemplates[0], [], true)).toThrow(
      /answer/i,
    );
  });
});
