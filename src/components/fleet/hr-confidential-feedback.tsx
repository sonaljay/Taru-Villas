"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  answerSchema,
  type Answer,
  type ReportTemplate,
} from "@/lib/fleet/structured-reports/model";
import type { readPrivateFeedback } from "@/lib/fleet/structured-reports/hr";
type Data = Awaited<ReturnType<typeof readPrivateFeedback>>;
async function request(url: string, method = "GET", body?: unknown) {
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
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Unable to save confidential feedback");
  return data;
}
export function HrConfidentialFeedback({
  requestId,
  questions,
  canEdit,
}: {
  requestId: string;
  questions: ReportTemplate["questions"];
  canEdit: boolean;
}) {
  const base = `/api/fleet/reports/${requestId}`,
    url = base + "/hr-feedback";
  const [data, setData] = useState<Data | null>(null),
    [answers, setAnswers] = useState<Answer[]>([]),
    [pending, setPending] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  function apply(d: Data) {
    setData(d);
    setAnswers(d.answers);
    setDirty(false);
  }
  useEffect(() => {
    let live = true;
    request(url)
      .then((d) => {
        if (live) {
          setData(d);
          setAnswers(d.answers);
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
  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function save() {
    if (!data) throw Error("Confidential feedback is still loading");
    const d = await request(url, "PATCH", { version: data.version, answers });
    apply(d);
  }
  async function upload(a: Answer, files: FileList | null) {
    if (!files?.length || !data) return;
    const selected = Array.from(files);
    if (
      data.photos.filter((p) => p.answerId === a.id).length + selected.length >
      5
    ) {
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
          await request(base + "/photos", "POST", form);
        }
      } finally {
        apply(await request(url));
      }
    });
  }
  const disabled = !canEdit || pending;
  const instances = [...new Set(answers.map((a) => a.instance))];
  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle>Confidential employee feedback · HQ HR only</CardTitle>
        <p className="text-sm text-muted-foreground">
          Only HQ HR committee members and admins can read these notes and
          photos. Save them separately. They are excluded from the property
          manager’s report, acknowledgement, notifications and shared tasks.
          Omit names when anonymity is requested.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <p>Loading confidential feedback…</p>}
        {instances.map((instance) => {
          const group = answers.filter((a) => a.instance === instance);
          return (
            <div key={instance} className="space-y-4 rounded-lg border p-4">
              <fieldset disabled={disabled} className="space-y-3">
                <label className="block space-y-1">
                  <span className="text-sm font-medium">
                    Employee department / role (name optional)
                  </span>
                  <Input
                    value={group[0]?.location || ""}
                    placeholder="e.g. Housekeeping — anonymous"
                    onChange={(e) => {
                      setAnswers((items) =>
                        items.map((a) =>
                          a.instance === instance
                            ? { ...a, location: e.target.value }
                            : a,
                        ),
                      );
                      setDirty(true);
                    }}
                  />
                </label>
                {canEdit && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAnswers((items) =>
                        items.filter((a) => a.instance !== instance),
                      );
                      setDirty(true);
                    }}
                  >
                    Remove conversation
                  </Button>
                )}
              </fieldset>
              {questions.map((q) => {
                const a = group.find((a) => a.questionId === q.id);
                if (!a) return null;
                const photos =
                  data?.photos.filter((p) => p.answerId === a.id) || [];
                return (
                  <div key={a.id} className="space-y-2">
                    <label className="block space-y-1">
                      <span className="text-sm font-medium">{q.label}</span>
                      <p className="text-xs text-muted-foreground">
                        {q.guidance}
                      </p>
                      <Textarea
                        disabled={disabled}
                        value={a.notes}
                        maxLength={5000}
                        onChange={(e) => {
                          setAnswers((items) =>
                            items.map((x) =>
                              x.id === a.id
                                ? { ...x, notes: e.target.value }
                                : x,
                            ),
                          );
                          setDirty(true);
                        }}
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Private photos · {photos.length}/5 · JPEG, PNG or WebP ·
                      10 MB each
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p) => (
                        <div key={p.id} className="rounded border p-2 text-sm">
                          <a
                            className="underline"
                            href={`${base}/photos?id=${p.id}&view=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {p.name}
                          </a>
                          {!disabled && (
                            <button
                              className="ml-2 text-destructive"
                              aria-label={`Remove ${p.name}`}
                              onClick={() =>
                                run(async () => {
                                  if (dirty) await save();
                                  await request(
                                    base + "/photos?id=" + p.id,
                                    "DELETE",
                                  );
                                  apply(await request(url));
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
                      <div className="flex flex-wrap gap-2">
                        <label className="cursor-pointer rounded border px-3 py-2 text-sm">
                          Upload private photos
                          <input
                            className="sr-only"
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
                          Take private photo
                          <input
                            className="sr-only"
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
                );
              })}
            </div>
          );
        })}
        {data && !instances.length && (
          <p className="text-sm text-muted-foreground">
            No confidential conversations recorded.
          </p>
        )}
        {data && canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={pending || answers.length + questions.length > 200}
              onClick={() => {
                const instance = crypto.randomUUID();
                setAnswers((items) => [
                  ...items,
                  ...questions.map((q) =>
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
              Add confidential conversation
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await save();
                  toast.success("Confidential feedback saved");
                })
              }
            >
              Save confidential feedback
            </Button>
            <span className="text-sm" role="status">
              {pending
                ? "Saving private notes…"
                : dirty
                  ? "Unsaved private changes"
                  : "Private notes saved"}
            </span>
          </div>
        )}
        {data && (
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Confidential history
            </summary>
            <ol className="mt-2 space-y-1 text-xs">
              {data.history.map((h, i) => (
                <li key={i}>
                  {String(h.actor)} · {String(h.kind).replaceAll("_", " ")} ·{" "}
                  {new Date(String(h.created_at)).toLocaleString()}
                </li>
              ))}
            </ol>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
