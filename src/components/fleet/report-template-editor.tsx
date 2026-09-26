"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ReportTemplate } from "@/lib/fleet/structured-reports/model";
type Template = { key: string; version: number; definition: ReportTemplate };
export function ReportTemplateEditor() {
  const [items, setItems] = useState<Template[]>([]),
    [selected, setSelected] = useState(""),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/fleet/report-templates")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw Error(b.error);
        setItems(b);
        setSelected(b[0]?.key || "");
      })
      .catch((e) => setError(e.message));
  }, []);
  const item = items.find((t) => t.key === selected);
  function update(definition: ReportTemplate) {
    setItems((ts) =>
      ts.map((t) => (t.key === selected ? { ...t, definition } : t)),
    );
  }
  async function save() {
    if (!item) return;
    setPending(true);
    try {
      const r = await fetch("/api/fleet/report-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: item.version,
          definition: item.definition,
        }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setItems((ts) =>
        ts.map((t) =>
          t.key === selected ? { ...t, version: t.version + 1 } : t,
        ),
      );
      toast.success("New template version published");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category report templates</CardTitle>
        <p className="text-sm text-muted-foreground">
          Changes apply to reports started after publishing. Existing reports
          retain their original questions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p role="alert">{error}</p>}
        <select
          aria-label="Report template"
          className="h-10 w-full rounded border bg-background px-3"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {items.map((t) => (
            <option key={t.key} value={t.key}>
              {t.definition.name} · version {t.version}
            </option>
          ))}
        </select>
        {selected === "hr" && (
          <p className="text-sm text-muted-foreground">
            Manage HQ HR membership in{" "}
            <Link className="underline" href="/tasks/committees">
              Committees
            </Link>
            . Members and admins can read confidential feedback. Property
            managers receive the shared report and employee evaluations.
          </p>
        )}
        {item && (
          <fieldset disabled={pending} className="space-y-4">
            <label className="block space-y-1">
              <span>Category name</span>
              <Input
                value={item.definition.name}
                onChange={(e) =>
                  update({ ...item.definition, name: e.target.value })
                }
              />
            </label>
            <label className="block space-y-1">
              <span>Visit types (one per line)</span>
              <Textarea
                value={item.definition.visitTypes.join("\n")}
                onChange={(e) =>
                  update({
                    ...item.definition,
                    visitTypes: e.target.value.split("\n"),
                  })
                }
              />
            </label>
            {[
              ...item.definition.sections,
              { id: "scorecard", title: "Scorecard" },
            ].map((section) => (
              <details key={section.id} className="rounded border p-3">
                <summary className="cursor-pointer font-medium">
                  {section.title}
                </summary>
                <div className="mt-3 space-y-3">
                  {section.id !== "scorecard" && (
                    <label className="block">
                      <span className="text-sm">Section title</span>
                      <Input
                        value={section.title}
                        onChange={(e) =>
                          update({
                            ...item.definition,
                            sections: item.definition.sections.map((s) =>
                              s.id === section.id
                                ? { ...s, title: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                  )}
                  {item.definition.questions
                    .filter((q) => q.sectionId === section.id)
                    .map((q) => (
                      <div
                        key={q.id}
                        className="space-y-2 rounded bg-muted/50 p-3"
                      >
                        <label className="block">
                          <span className="text-sm">Question</span>
                          <Input
                            value={q.label}
                            onChange={(e) =>
                              update({
                                ...item.definition,
                                questions: item.definition.questions.map((x) =>
                                  x.id === q.id
                                    ? { ...x, label: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-sm">Guidance</span>
                          <Textarea
                            value={q.guidance}
                            onChange={(e) =>
                              update({
                                ...item.definition,
                                questions: item.definition.questions.map((x) =>
                                  x.id === q.id
                                    ? { ...x, guidance: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <Button
                          variant="ghost"
                          disabled={
                            q.kind === "employee_score" ||
                            q.id === "private-feedback" ||
                            q.id === "private-assessment"
                          }
                          onClick={() =>
                            update({
                              ...item.definition,
                              questions: item.definition.questions.filter(
                                (x) => x.id !== q.id,
                              ),
                            })
                          }
                        >
                          Remove question
                        </Button>
                      </div>
                    ))}
                  <Button
                    variant="outline"
                    disabled={section.id === "employee-evaluations"}
                    onClick={() =>
                      update({
                        ...item.definition,
                        questions: [
                          ...item.definition.questions,
                          {
                            id: "q-" + crypto.randomUUID(),
                            sectionId: section.id,
                            label: "New question",
                            guidance: "",
                            kind:
                              section.id === "scorecard"
                                ? "score"
                                : section.id === "confidential-feedback"
                                  ? "confidential"
                                  : "inspection",
                          },
                        ],
                      })
                    }
                  >
                    Add question
                  </Button>
                </div>
              </details>
            ))}
            <Button onClick={save} disabled={pending}>
              Publish new version
            </Button>
          </fieldset>
        )}
      </CardContent>
    </Card>
  );
}
