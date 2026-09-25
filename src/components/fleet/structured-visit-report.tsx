"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VisitReportClient } from "./visit-report-client";
import {
  scoreSummary,
  answerSchema,
  type Answer,
  type ReportContent,
  type ReportTemplate,
} from "@/lib/fleet/structured-reports/model";
import type { readReport } from "@/lib/fleet/structured-reports/service";
type Data = Awaited<ReturnType<typeof readReport>>;
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const date = (s: unknown) =>
  s ? new Date(String(s)).toLocaleString() : "Pending";
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    cache: "no-store",
    ...(body instanceof FormData
      ? { body }
      : body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "Unable to save report");
  return result;
}
export function StructuredVisitReport({ requestId }: { requestId: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false);
  const [content, setContent] = useState<ReportContent | null>(null),
    [answers, setAnswers] = useState<Answer[]>([]),
    [property, setProperty] = useState("");
  const base = `/api/fleet/reports/${requestId}`,
    url = base + "/structured";
  function apply(d: Data) {
    setData(d);
    setContent(d.content);
    setAnswers(d.answers);
    setProperty(d.report.propertyId || "");
    setDirty(false);
  }
  useEffect(() => {
    let live = true;
    api(url)
      .then((d) => {
        if (live) {
          setData(d);
          setContent(d.content);
          setAnswers(d.answers);
          setProperty(d.report.propertyId || "");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [url]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const update = (id: string, patch: Partial<Answer>) => {
    setAnswers((items) =>
      items.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
    setDirty(true);
  };
  const details = (patch: Partial<ReportContent>) => {
    setContent((c) => (c ? { ...c, ...patch } : c));
    setDirty(true);
  };
  async function save(submit = false) {
    if (!data) return;
    const result = await api(url, "PATCH", {
      version: data.report.version,
      content,
      answers,
      submit,
    });
    apply(result);
    return result as Data;
  }
  async function upload(a: Answer, files: FileList | null) {
    if (!files?.length || !data) return;
    const selected = Array.from(files);
    const count = data.photos.filter((p) => p.answerId === a.id).length;
    if (count + selected.length > 5) {
      toast.error("Each question allows up to five photos");
      return;
    }
    await run(async () => {
      await save();
      try {
        for (const file of selected) {
          const form = new FormData();
          form.set("answerId", a.id);
          form.set("file", file);
          await api(base + "/photos", "POST", form);
        }
      } finally {
        apply(await api(url));
      }
    });
  }
  if (!data)
    return (
      <div className="p-6" role="status">
        {error || "Loading visit report…"}
      </div>
    );
  if (!data.template && data.hasLegacyContent)
    return <VisitReportClient requestId={requestId} />;
  if (!data.template)
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
        <h1 className="text-2xl font-semibold">Choose your visit report</h1>
        <p className="text-muted-foreground">
          Each category has its own inspection questions and scorecard. The
          category and property are fixed once you begin.
        </p>
        <label className="block space-y-2">
          <span>Property</span>
          <select
            aria-label="Property"
            className={selectClass}
            disabled={!!data.report.propertyId || pending || !data.canEdit}
            value={property}
            onChange={(e) => setProperty(e.target.value)}
          >
            <option value="">Choose a property</option>
            {data.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {data.templates.map((t) => (
            <Card key={t.key}>
              <CardHeader>
                <CardTitle>{t.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  disabled={!property || pending || !data.canEdit}
                  onClick={() =>
                    run(async () =>
                      apply(
                        await api(url, "POST", {
                          key: t.key,
                          propertyId: property,
                        }),
                      ),
                    )
                  }
                >
                  Begin report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {!data.canEdit && (
          <p>The report owner has not selected a category yet.</p>
        )}
      </div>
    );
  const template = data.template,
    disabled = pending || !data.canEdit;
  const scores = scoreSummary(
    answers
      .filter(
        (a) =>
          template.questions.find((q) => q.id === a.questionId)?.kind ===
          "score",
      )
      .map((a) => a.rating),
  );
  const taskPatch = (
    a: Answer,
    patch: Partial<Extract<Answer["task"], { kind: "new" }>>,
  ) => {
    if (a.task.kind === "new") update(a.id, { task: { ...a.task, ...patch } });
  };
  function question(q: ReportTemplate["questions"][number], a: Answer) {
    const photos = data!.photos.filter((p) => p.answerId === a.id);
    return (
      <article
        key={a.id}
        className="space-y-4 rounded-xl border bg-background p-4 md:p-5"
      >
        <div>
          <h3 className="font-medium">{q.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{q.guidance}</p>
        </div>
        <fieldset disabled={disabled} className="space-y-3">
          {q.kind === "score" ? (
            <label className="block space-y-1">
              <span className="text-sm">Rating</span>
              <select
                aria-label={`${q.label} rating`}
                className={selectClass}
                value={a.rating ?? ""}
                onChange={(e) =>
                  update(a.id, {
                    rating:
                      e.target.value === "na"
                        ? "na"
                        : e.target.value
                          ? Number(e.target.value)
                          : null,
                    notApplicable: e.target.value === "na",
                  })
                }
              >
                <option value="">Choose a rating</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} / 5
                  </option>
                ))}
                <option value="na">Not applicable</option>
              </select>
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.notApplicable}
                onChange={(e) =>
                  update(a.id, { notApplicable: e.target.checked })
                }
              />
              Not applicable
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-sm">
              {q.kind === "score" ? "Score notes (optional)" : "Findings"}
            </span>
            <Textarea
              aria-label={`${q.label} findings`}
              value={a.notes}
              maxLength={5000}
              placeholder="Record what you observed, including any issues."
              onChange={(e) => update(a.id, { notes: e.target.value })}
            />
          </label>
          <div className="rounded-lg bg-muted/40 p-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-sm font-medium">
                Follow-up task (optional)
              </span>
              <select
                className={selectClass}
                value={a.task.kind}
                onChange={(e) =>
                  update(a.id, {
                    task:
                      e.target.value === "none"
                        ? { kind: "none" }
                        : e.target.value === "existing"
                          ? {
                              kind: "existing",
                              taskId: data!.taskOptions[0]?.id || "",
                            }
                          : {
                              kind: "new",
                              title: "",
                              description: "",
                              projectId: null,
                              assigneeIds: [],
                              priority: "medium",
                              dueDate: null,
                            },
                  })
                }
              >
                <option value="none">No task</option>
                <option value="existing" disabled={!data!.taskOptions.length}>
                  Link existing task
                </option>
                <option value="new">Create new task</option>
              </select>
            </label>
            {a.task.kind === "existing" && (
              <>
                <select
                  aria-label="Existing task"
                  className={selectClass}
                  value={a.task.taskId}
                  onChange={(e) =>
                    update(a.id, {
                      task: { kind: "existing", taskId: e.target.value },
                    })
                  }
                >
                  {!data!.taskOptions.some(
                    (t) => a.task.kind === "existing" && t.id === a.task.taskId,
                  ) && (
                    <option value={a.task.taskId}>
                      Linked task (not in available list)
                    </option>
                  )}
                  {data!.taskOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <a
                  href={`/tasks?task=${a.task.taskId}`}
                  className="text-sm underline"
                >
                  Open task
                </a>
              </>
            )}
            {a.task.kind === "new" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-sm">Task title</span>
                  <Input
                    value={a.task.title}
                    onChange={(e) => taskPatch(a, { title: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Project</span>
                  <select
                    className={selectClass}
                    value={a.task.projectId || ""}
                    onChange={(e) =>
                      taskPatch(a, { projectId: e.target.value || null })
                    }
                  >
                    <option value="">No project</option>
                    {data!.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Priority</span>
                  <select
                    className={selectClass}
                    value={a.task.priority}
                    onChange={(e) =>
                      taskPatch(a, {
                        priority: e.target.value as "low" | "medium" | "high",
                      })
                    }
                  >
                    {["low", "medium", "high"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Due date</span>
                  <Input
                    type="date"
                    value={a.task.dueDate || ""}
                    onChange={(e) =>
                      taskPatch(a, { dueDate: e.target.value || null })
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm">Assignees</span>
                  <select
                    multiple
                    className="w-full rounded border p-2 text-sm"
                    value={a.task.assigneeIds}
                    onChange={(e) =>
                      taskPatch(a, {
                        assigneeIds: Array.from(
                          e.target.selectedOptions,
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {data!.people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-sm">Task details</span>
                  <Textarea
                    value={a.task.description}
                    onChange={(e) =>
                      taskPatch(a, { description: e.target.value })
                    }
                  />
                </label>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Created when you submit or save a submitted report. Ownership
                  starts with the Operations Committee.
                </p>
              </div>
            )}
          </div>
        </fieldset>
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Photos · {photos.length}/5{" "}
            <span className="font-normal text-muted-foreground">
              Optional · JPEG, PNG or WebP · 10 MB each
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-1 rounded border p-2 text-sm"
              >
                <a
                  className="max-w-48 truncate underline"
                  href={`${base}/photos?id=${p.id}&view=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {p.name}
                </a>
                {!disabled && (
                  <button
                    aria-label={`Remove ${p.name}`}
                    className="px-2 text-destructive"
                    onClick={() =>
                      run(async () => {
                        if (dirty) await save();
                        await api(base + "/photos?id=" + p.id, "DELETE");
                        apply(await api(url));
                      })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {!disabled && photos.length < 5 && (
            <div className="flex flex-wrap gap-3">
              <label className="cursor-pointer rounded border px-3 py-2 text-sm">
                Upload photos
                <input
                  className="sr-only"
                  aria-label={`Upload photos for ${q.label}`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => {
                    void upload(a, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="cursor-pointer rounded border px-3 py-2 text-sm">
                Take photo
                <input
                  className="sr-only"
                  aria-label={`Take photo for ${q.label}`}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    void upload(a, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-28 md:p-8 md:pb-28">
      <header className="space-y-2">
        <a className="text-sm text-muted-foreground underline" href="/fleet">
          Back to Fleet
        </a>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{template.name}</h1>
          <Badge variant="secondary">
            {data.report.submittedAt ? "Submitted" : "Draft"}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {data.properties.find((p) => p.id === data.report.propertyId)?.name} ·
          Visit report
        </p>
        <p className="text-sm text-muted-foreground">
          {data.report.dueAt
            ? `Editing closes ${date(data.report.dueAt)}`
            : "You can draft now. Submission opens when the trip is completed."}
        </p>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive p-4 text-destructive"
        >
          {error}
          <Button
            variant="ghost"
            onClick={() => run(async () => apply(await api(url)))}
          >
            Reload saved report
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Visit details & summary</CardTitle>
        </CardHeader>
        <CardContent>
          <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm">Visit type</span>
              <select
                className={selectClass}
                value={content?.visitType || ""}
                onChange={(e) => details({ visitType: e.target.value })}
              >
                <option value="">Choose visit type</option>
                {template.visitTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm">Visit date</span>
              <Input
                type="date"
                value={content?.visitDate || ""}
                onChange={(e) => details({ visitDate: e.target.value })}
              />
            </label>
            {(["timeIn", "timeOut"] as const).map((key, i) => (
              <label className="space-y-1" key={key}>
                <span className="text-sm">
                  {i ? "Time out" : "Time in"} (optional)
                </span>
                <Input
                  type="time"
                  value={content?.[key] || ""}
                  onChange={(e) => details({ [key]: e.target.value })}
                />
              </label>
            ))}
            {template.key === "security" && (
              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm">Third-party security firm</span>
                <Input
                  value={content?.thirdPartyFirm || ""}
                  onChange={(e) => details({ thirdPartyFirm: e.target.value })}
                />
              </label>
            )}
            <label className="space-y-1 sm:col-span-2">
              <span className="text-sm">Executive summary</span>
              <Textarea
                value={content?.summary || ""}
                onChange={(e) => details({ summary: e.target.value })}
                placeholder="Overall findings, key concerns and recommended actions"
              />
            </label>
          </fieldset>
        </CardContent>
      </Card>
      {template.sections.map((section) => {
        const qs = template.questions.filter((q) => q.sectionId === section.id),
          instances = [
            ...new Set(
              answers
                .filter((a) => qs.some((q) => q.id === a.questionId))
                .map((a) => a.instance),
            ),
          ];
        return (
          <section key={section.id} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-semibold">{section.title}</h2>
              {!disabled && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const instance = crypto.randomUUID();
                    setAnswers((items) => [
                      ...items,
                      ...qs.map((q) =>
                        answerSchema.parse({
                          id: crypto.randomUUID(),
                          questionId: q.id,
                          instance,
                          location: "",
                        }),
                      ),
                    ]);
                    setDirty(true);
                  }}
                >
                  Add another area
                </Button>
              )}
            </div>
            {instances.map((instance) => {
              const group = answers.filter(
                (a) =>
                  a.instance === instance &&
                  qs.some((q) => q.id === a.questionId),
              );
              return (
                <div
                  key={instance}
                  className="space-y-3 rounded-xl bg-muted/40 p-3"
                >
                  <div className="flex items-end gap-3">
                    <label className="flex-1 space-y-1">
                      <span className="text-sm font-medium">Room or area</span>
                      <Input
                        disabled={disabled}
                        placeholder="e.g. Room 3, east garden"
                        value={group[0]?.location || ""}
                        onChange={(e) => {
                          setAnswers((items) =>
                            items.map((a) =>
                              group.some((g) => g.id === a.id)
                                ? { ...a, location: e.target.value }
                                : a,
                            ),
                          );
                          setDirty(true);
                        }}
                      />
                    </label>
                    {instance !== "default" && !disabled && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setAnswers((items) =>
                            items.filter(
                              (a) => !group.some((g) => g.id === a.id),
                            ),
                          );
                          setDirty(true);
                        }}
                      >
                        Remove area
                      </Button>
                    )}
                  </div>
                  {qs.map((q) => {
                    const a = group.find((a) => a.questionId === q.id);
                    return a ? question(q, a) : null;
                  })}
                </div>
              );
            })}
          </section>
        );
      })}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Property scorecard</h2>
        <p className="text-sm text-muted-foreground">
          1 = poor · 5 = excellent. Not applicable items are excluded from the
          total.
        </p>
        <div className="rounded-xl border p-4">
          <strong>
            {scores.average === null
              ? "No rated items"
              : `${scores.average.toFixed(1)} / 5`}
          </strong>
          <span className="ml-3 text-sm text-muted-foreground">
            {scores.total}/{scores.possible} points · {scores.rated} rated ·{" "}
            {scores.unanswered} unanswered
          </span>
        </div>
        {template.questions
          .filter((q) => q.kind === "score")
          .map((q) => {
            const a = answers.find((a) => a.questionId === q.id);
            return a ? question(q, a) : null;
          })}
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Open comments</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Open comments"
            disabled={disabled}
            value={content?.openComments || ""}
            onChange={(e) => details({ openComments: e.target.value })}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Property manager acknowledgement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Acknowledgement confirms the report has been read. Managers are
            notified on submission and asked to acknowledge again after changes.
          </p>
          {data.acknowledgements.map((a) => (
            <div
              key={a.profileId}
              className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm"
            >
              <span>{a.name}</span>
              <span>
                {a.acknowledgedAt
                  ? `Read ${date(a.acknowledgedAt)}`
                  : "Awaiting acknowledgement"}
              </span>
            </div>
          ))}
          {!data.acknowledgements.length && (
            <p className="text-sm">
              {data.report.submittedAt
                ? "No property manager is assigned to this property. Ask an admin to assign one."
                : "Property managers will be assigned when this report is submitted."}
            </p>
          )}
          {data.canAcknowledge && (
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  apply(
                    await api(url, "PUT", { version: data.report.version }),
                  );
                  toast.success("Acknowledgement recorded");
                })
              }
            >
              I have read this report and understand the findings
            </Button>
          )}
        </CardContent>
      </Card>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer font-medium">Report history</summary>
        <ol className="mt-3 space-y-2 text-sm">
          {data.history.map((h, i) => (
            <li key={i}>
              {String(h.actor)} · {String(h.kind).replaceAll("_", " ")} ·{" "}
              {date(h.created_at)}
            </li>
          ))}
        </ol>
      </details>
      {data.canEdit && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
            <span
              className="mr-auto text-sm text-muted-foreground"
              role="status"
            >
              {pending
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : "All changes saved"}
            </span>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await save();
                  toast.success("Report saved");
                })
              }
            >
              {data.report.submittedAt ? "Save changes" : "Save draft"}
            </Button>
            {!data.report.submittedAt && (
              <Button
                disabled={pending || !data.canSubmit}
                onClick={() =>
                  run(async () => {
                    await save(true);
                    toast.success(
                      "Report submitted; property managers notified",
                    );
                  })
                }
              >
                Submit report
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
