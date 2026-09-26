import { describe, it, expect } from "vitest";
import { reportTemplates, validateAnswers, answerSchema } from "./model";
describe("HR report template", () => {
  it("preserves HR source questions and separates employee/private sections", () => {
    const t = reportTemplates.find((t) => t.key === "hr")!;
    expect(t).toBeDefined();
    expect(t.questions.filter((q) => q.kind === "inspection")).toHaveLength(17);
    expect(t.questions.filter((q) => q.kind === "score")).toHaveLength(5);
    expect(t.questions.filter((q) => q.kind === "employee_score")).toHaveLength(
      5,
    );
    expect(t.questions.filter((q) => q.kind === "confidential")).toHaveLength(
      2,
    );
  });
  it("requires complete five-score employee evaluations in the shared report", () => {
    const t = reportTemplates.find((t) => t.key === "hr")!;
    const answers = t.questions
      .filter((q) => q.kind !== "confidential")
      .map((q) =>
        answerSchema.parse({
          id: crypto.randomUUID(),
          questionId: q.id,
          notes: "Reviewed",
          rating: q.kind === "inspection" ? null : 4,
          location:
            q.kind === "employee_score" ? "QA Employee" : "Property-wide",
          evaluation: { department: "HK", feedback: "Agreed training" },
        }),
      );
    expect(() => validateAnswers(t, answers, true)).not.toThrow();
    answers.find((a) => a.questionId === "employee-1")!.rating = null;
    expect(() => validateAnswers(t, answers, true)).toThrow(/score/i);
  });
});
