import { z } from "zod/v4";
import seeds from "./seeds.json";
const key = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .max(80);
export const templateSchema = z
  .object({
    key,
    name: z.string().trim().min(1).max(200),
    visitTypes: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
    sections: z
      .array(z.object({ id: key, title: z.string().trim().min(1).max(200) }))
      .min(1)
      .max(30),
    questions: z
      .array(
        z.object({
          id: key,
          sectionId: key,
          label: z.string().trim().min(1).max(300),
          guidance: z.string().max(3000),
          kind: z.enum(["inspection", "score"]),
        }),
      )
      .min(1)
      .max(200),
  })
  .superRefine((t, ctx) => {
    if (
      new Set(t.questions.map((q) => q.id)).size !== t.questions.length ||
      new Set(t.sections.map((s) => s.id)).size !== t.sections.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Question and section IDs must be unique",
      });
    for (const q of t.questions)
      if (
        (q.kind === "inspection" &&
          !t.sections.some((s) => s.id === q.sectionId)) ||
        (q.kind === "score" && q.sectionId !== "scorecard")
      )
        ctx.addIssue({ code: "custom", message: "Invalid question section" });
  });
export type ReportTemplate = z.infer<typeof templateSchema>;
export const reportTemplates = seeds.map((t) => templateSchema.parse(t));
export const taskChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("existing"), taskId: z.uuid() }),
  z.object({
    kind: z.literal("new"),
    title: z.string().trim().max(500),
    description: z.string().max(5000).default(""),
    projectId: z.uuid().nullable().default(null),
    assigneeIds: z.array(z.uuid()).max(20).default([]),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: z.iso.date().nullable().default(null),
  }),
]);
export const answerSchema = z.object({
  id: z.uuid(),
  questionId: key,
  instance: z.string().max(80).default("default"),
  location: z.string().trim().max(200).default("Property-wide"),
  notes: z.string().trim().max(5000).default(""),
  rating: z
    .union([z.number().int().min(1).max(5), z.literal("na"), z.null()])
    .default(null),
  notApplicable: z.boolean().default(false),
  task: taskChoiceSchema.default({ kind: "none" }),
});
export type Answer = z.infer<typeof answerSchema>;
export const contentSchema = z.object({
  summary: z.string().trim().max(5000).default(""),
  visitType: z.string().max(100).default(""),
  visitDate: z.union([z.iso.date(), z.literal("")]).default(""),
  timeIn: z.string().max(20).default(""),
  timeOut: z.string().max(20).default(""),
  thirdPartyFirm: z.string().max(200).default(""),
  openComments: z.string().max(5000).default(""),
});
export type ReportContent = z.infer<typeof contentSchema>;
export const saveSchema = z.object({
  version: z.number().int().min(0),
  content: contentSchema,
  answers: z.array(answerSchema).max(500),
  submit: z.boolean().default(false),
});
export function scoreSummary(values: (number | "na" | null)[]) {
  const numbers = values.filter((v): v is number => typeof v === "number");
  const total = numbers.reduce((s, n) => s + n, 0);
  return {
    total,
    possible: numbers.length * 5,
    average: numbers.length ? total / numbers.length : null,
    rated: numbers.length,
    unanswered: values.filter((v) => v === null).length,
  };
}
export function validateAnswers(
  template: ReportTemplate,
  answers: Answer[],
  complete: boolean,
) {
  const seen = new Set<string>(),
    ids = new Set<string>();
  for (const a of answers) {
    const q = template.questions.find((q) => q.id === a.questionId);
    if (!q) throw Error("Unknown report question");
    const k = a.questionId + ":" + a.instance;
    if (seen.has(k) || ids.has(a.id)) throw Error("Duplicate answer");
    seen.add(k);
    ids.add(a.id);
    if (q.kind === "inspection" && a.rating !== null)
      throw Error("Inspection answers cannot have ratings");
    if (q.kind === "score" && a.notApplicable !== (a.rating === "na"))
      throw Error("Score not-applicable state must match its rating");
    if (complete && !a.location)
      throw Error("Enter a room or area for every inspection");
    if (q.kind === "score" && a.instance !== "default")
      throw Error("Scorecard questions cannot repeat");
    if (complete) {
      if (q.kind === "score" && a.rating === null)
        throw Error(`Answer the score for ${q.label}`);
      if (q.kind === "inspection" && !a.notApplicable && !a.notes)
        throw Error(`Answer ${q.label} or mark it not applicable`);
      if (a.task.kind === "new" && !a.task.title)
        throw Error("Enter a title for each new task");
    }
  }
  if (complete) {
    for (const section of template.sections) {
      const qs = template.questions.filter((q) => q.sectionId === section.id);
      const groups = new Set(
        answers
          .filter((a) => qs.some((q) => q.id === a.questionId))
          .map((a) => a.instance),
      );
      for (const instance of groups)
        if (
          qs.some(
            (q) =>
              !answers.some(
                (a) => a.questionId === q.id && a.instance === instance,
              ),
          )
        )
          throw Error("Complete every question in each repeated area");
    }
  }
  if (
    complete &&
    template.questions.some((q) => !answers.some((a) => a.questionId === q.id))
  )
    throw Error("Answer every report question");
}
