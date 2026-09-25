import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import postgres from "postgres";
import { bootstrapReportTests } from "./test-bootstrap";
vi.mock("@/lib/auth/guards", () => ({
  getProfile: async () => ({
    id: "00000000-0000-4000-8000-000000000002",
    orgId: "00000000-0000-4000-8000-000000000001",
    isActive: true,
  }),
}));
const storage = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ error: null })),
  remove: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({
    error: null,
    data: { signedUrl: "https://storage.example.test/private-photo" },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => storage } }),
}));
const url = process.env.TASK_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("structured visit report workflow", () => {
  const admin = "00000000-0000-4000-8000-000000000002",
    manager = "00000000-0000-4000-8000-000000000004",
    outsider = "00000000-0000-4000-8000-000000000003",
    org = "00000000-0000-4000-8000-000000000001";
  let requestId: string, propertyId: string;
  const db = postgres(url || "postgres://postgres@localhost:55439/taru_tasks", {
    max: 1,
  });
  beforeAll(async () => {
    if (!url?.includes("localhost:55439/taru_tasks"))
      throw Error("Disposable DB only");
    vi.stubEnv("POSTGRES_URL", url);
    vi.stubEnv("DATABASE_URL", url);
    await bootstrapReportTests(db);
    await db`insert into auth.users(id) values(${manager}) on conflict do nothing`;
    await db`insert into profiles(id,org_id,email,full_name,role) values(${manager},${org},'manager@example.test','QA Manager','property_manager') on conflict do nothing`;
    const [property] =
      await db`insert into properties(org_id,name,slug,code) values(${org},'Report QA','report-qa','REPORT-QA') on conflict(code) do update set name=excluded.name returning id`;
    propertyId = property.id;
    await db`insert into property_assignments(user_id,property_id) values(${manager},${propertyId}) on conflict do nothing`;
    const [request] =
      await db`insert into fleet_requests(org_id,requested_by,request_type,target_property_id,start_date,end_date) values(${org},${admin},'standalone',${propertyId},current_date,current_date) returning id`;
    requestId = request.id;
    await db`insert into fleet_trip_reports(org_id,request_id,submitted_by) values(${org},${requestId},${admin})`;
  });
  afterAll(() => db.end());
  it("starts with a frozen seeded template and hides reports from unrelated staff", async () => {
    const { startReport, readReport } = await import("./service");
    await startReport(admin, requestId, { key: "styling", propertyId });
    const page = await readReport(admin, requestId);
    expect(page.template?.questions).toHaveLength(19);
    expect(page.answers).toHaveLength(19);
    await expect(readReport(outsider, requestId)).rejects.toThrow(/not found/i);
    await expect(
      startReport(admin, requestId, { key: "security", propertyId }),
    ).rejects.toThrow(/already/i);
  });
  it("preserves incomplete drafts and rejects stale saves", async () => {
    const { readReport, saveReport } = await import("./service");
    const page = await readReport(admin, requestId);
    await saveReport(admin, requestId, {
      version: page.report.version,
      content: { ...page.content, summary: "Draft" },
      answers: page.answers,
      submit: false,
    });
    await expect(
      saveReport(admin, requestId, {
        version: page.report.version,
        content: page.content,
        answers: page.answers,
        submit: false,
      }),
    ).rejects.toThrow(/changed/i);
    expect((await readReport(admin, requestId)).content.summary).toBe("Draft");
  });
  it("submits once, assigns managers, and records their acknowledgement", async () => {
    const { readReport, saveReport, acknowledgeReport } =
      await import("./service");
    const page = await readReport(admin, requestId);
    await db`update fleet_requests set status='completed' where id=${requestId}`;
    await db`update fleet_trip_reports set due_at=now()+interval '48 hours' where request_id=${requestId}`;
    const answers = page.answers.map((a) => ({
      ...a,
      notes: "Inspected",
      rating: a.questionId.startsWith("score-") ? 4 : null,
    }));
    const data = {
      version: page.report.version,
      content: {
        ...page.content,
        summary: "Inspection completed",
        visitType: "Routine Styling Audit",
        visitDate: "2026-09-25",
      },
      answers,
      submit: true,
    };
    await saveReport(admin, requestId, data);
    await expect(saveReport(admin, requestId, data)).rejects.toThrow(
      /changed/i,
    );
    const view = await readReport(manager, requestId);
    expect(view.acknowledgements).toHaveLength(1);
    await acknowledgeReport(manager, requestId, view.report.version);
    expect(
      (await readReport(manager, requestId)).acknowledgements[0].acknowledgedAt,
    ).toBeTruthy();
  });
  it("revisions reset acknowledgement and create a follow-up task exactly once", async () => {
    const { readReport, saveReport, acknowledgeReport } =
      await import("./service");
    const page = await readReport(admin, requestId);
    const answers = structuredClone(page.answers);
    answers[0].task = {
      kind: "new",
      title: "Repair report fixture",
      description: "Follow-up",
      projectId: null,
      assigneeIds: [manager],
      priority: "high",
      dueDate: null,
    };
    const input = {
      version: page.report.version,
      content: page.content,
      answers,
    };
    await saveReport(admin, requestId, input);
    await expect(saveReport(admin, requestId, input)).rejects.toThrow(
      /changed/i,
    );
    const updated = await readReport(manager, requestId);
    expect(updated.acknowledgements[0].acknowledgedAt).toBeNull();
    expect(updated.answers[0].task.kind).toBe("existing");
    await expect(
      acknowledgeReport(manager, requestId, page.report.version),
    ).rejects.toThrow(/changed/i);
    const [count] =
      await db`select count(*) n from tasks where title='Repair report fixture' and id in(select task_id from fleet_report_task_links where report_id=${page.report.id})`;
    expect(Number(count.n)).toBe(1);
  });
  it("reserves at most five photos concurrently and rejects foreign answers", async () => {
    const { readReport } = await import("./service");
    const { reservePhoto } = await import("./photos");
    const page = await readReport(admin, requestId);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reservePhoto(
          admin,
          requestId,
          page.answers[0].id,
          "test.jpg",
          "image/jpeg",
          100,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    await expect(
      reservePhoto(
        admin,
        requestId,
        crypto.randomUUID(),
        "test.jpg",
        "image/jpeg",
        100,
      ),
    ).rejects.toThrow(/Save this question/i);
    await expect(
      reservePhoto(
        manager,
        requestId,
        page.answers[1].id,
        "test.jpg",
        "image/jpeg",
        100,
      ),
    ).rejects.toThrow(/owner/i);
  });
  it("keeps the original snapshot after template publication and rejects legacy writes", async () => {
    const { readReport, publishTemplate } = await import("./service");
    const page = await readReport(admin, requestId);
    const [latest] =
      await db`select version,definition from visit_report_templates where org_id=${org} and key='styling' order by version desc limit 1`;
    await publishTemplate(admin, {
      version: latest.version,
      definition: { ...latest.definition, name: "Updated styling" },
    });
    expect((await readReport(admin, requestId)).template?.name).toBe(
      page.template?.name,
    );
    const { saveVisitReportDraft } =
      await import("@/lib/db/queries/fleet-trip-reports");
    await expect(
      saveVisitReportDraft(requestId, org, admin, {}),
    ).rejects.toThrow(/category report form/i);
  });
  it("validates private photos, audits ready uploads and cleans failed uploads", async () => {
    const { readReport, acknowledgeReport } = await import("./service");
    const { uploadPhoto, photoAction } = await import("./photos");
    const page = await readReport(admin, requestId);
    const answer = page.answers[2];
    await acknowledgeReport(manager, requestId, page.report.version);
    const image = new File(
      [new Uint8Array([255, 216, 255, 224, 0, 0])],
      "qa.jpg",
      { type: "image/jpeg" },
    );
    await expect(
      uploadPhoto(
        admin,
        requestId,
        answer.id,
        new File(["not an image"], "bad.jpg"),
      ),
    ).rejects.toThrow(/valid/i);
    const photo = await uploadPhoto(admin, requestId, answer.id, image);
    const ready = await readReport(manager, requestId);
    expect(ready.photos.some((p) => p.id === photo.id)).toBe(true);
    expect(ready.report.version).toBe(page.report.version + 1);
    expect(ready.acknowledgements[0].acknowledgedAt).toBeNull();
    expect(await photoAction(manager, requestId, photo.id)).toHaveProperty(
      "url",
    );
    expect(storage.createSignedUrl).toHaveBeenCalledWith(
      expect.any(String),
      60,
    );
    await expect(photoAction(outsider, requestId, photo.id)).rejects.toThrow(
      /not found/i,
    );
    await expect(
      photoAction(manager, requestId, photo.id, true),
    ).rejects.toThrow(/owner/i);
    await photoAction(admin, requestId, photo.id, true);
    await expect(photoAction(admin, requestId, photo.id)).rejects.toThrow(
      /not found/i,
    );
    storage.upload.mockRejectedValueOnce(Error("Storage unavailable"));
    await expect(
      uploadPhoto(admin, requestId, answer.id, image),
    ).rejects.toThrow(/Storage unavailable/);
    const remaining =
      await db`select id from visit_report_photos where answer_id=${answer.id} and state='uploading'`;
    expect(remaining).toHaveLength(0);
    const cleanup =
      await db`select c.storage_path from task_file_cleanup c join visit_report_photos p on p.storage_path=c.storage_path where p.answer_id=${answer.id}`;
    expect(cleanup).toHaveLength(2);
  });
  it("blocks legacy GET from returning unscoped task choices for category reports", async () => {
    const { GET } = await import("@/app/api/fleet/reports/[requestId]/route");
    const { NextRequest } = await import("next/server");
    const response = await GET(
      new NextRequest("http://localhost/api/fleet/reports/" + requestId),
      { params: Promise.resolve({ requestId }) },
    );
    expect(response.status).toBe(409);
  });
  it("retains assignment history and access for a travelling task creator", async () => {
    const { readReport, saveReport } = await import("./service");
    await db`update fleet_trip_reports set submitted_by=${outsider} where request_id=${requestId}`;
    const page = await readReport(outsider, requestId);
    const answers = structuredClone(page.answers);
    answers[1].task = {
      kind: "new",
      title: "Traveller followup",
      description: "",
      projectId: null,
      assigneeIds: [manager],
      priority: "medium",
      dueDate: null,
    };
    await saveReport(outsider, requestId, {
      version: page.report.version,
      answers,
      content: page.content,
    });
    const updated = await readReport(outsider, requestId);
    const task = updated.answers[1].task;
    expect(task.kind).toBe("existing");
    if (task.kind === "existing")
      expect(updated.taskOptions.some((t) => t.id === task.taskId)).toBe(true);
    const events =
      await db`select after_value from visit_report_events where report_id=${page.report.id} and kind='acknowledgement_assigned'`;
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(
      events.some(
        (e) =>
          e.after_value.profileId === manager &&
          e.after_value.version === updated.report.version,
      ),
    ).toBe(true);
    await db`update fleet_trip_reports set submitted_by=${admin} where request_id=${requestId}`;
  });
  it("scopes legacy task and project choices even before category selection", async () => {
    const [hidden] =
      await db`insert into tasks(org_id,title) values(${org},'Private unrelated fixture') returning id`;
    const { getVisitReportPage } =
      await import("@/lib/db/queries/fleet-trip-reports");
    const page = await getVisitReportPage(requestId, org, manager);
    expect(page?.taskOptions.some((t) => t.id === hidden.id)).toBe(false);
  });
  it("blocks edits at expiry but preserves read access", async () => {
    const { readReport, saveReport } = await import("./service");
    await db`update fleet_trip_reports set due_at=now()-interval '1 second' where request_id=${requestId}`;
    const page = await readReport(admin, requestId);
    expect(page.canEdit).toBe(false);
    await expect(
      saveReport(admin, requestId, {
        version: page.report.version,
        content: page.content,
        answers: page.answers,
        submit: false,
      }),
    ).rejects.toThrow(/window/i);
  });
});
