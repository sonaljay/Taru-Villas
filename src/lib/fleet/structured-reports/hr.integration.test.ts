import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import postgres from "postgres";
import { bootstrapReportTests } from "./test-bootstrap";
vi.mock("@/lib/auth/guards", () => ({ getProfile: async () => null }));
const url = process.env.TASK_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite("HR report confidentiality", () => {
  const db = postgres(url || "postgres://postgres@localhost:55439/taru_tasks", {
    max: 1,
  });
  const org = "00000000-0000-4000-8000-000000000001",
    admin = "00000000-0000-4000-8000-000000000002",
    hr = "00000000-0000-4000-8000-000000000003",
    pm = "00000000-0000-4000-8000-000000000004";
  let id: string, property: string, committee: string, privateAnswer: string;
  beforeAll(async () => {
    const u = new URL(url!);
    if (
      u.hostname !== "localhost" ||
      u.port !== "55439" ||
      u.pathname !== "/taru_tasks"
    )
      throw Error("Disposable database only");
    vi.stubEnv("POSTGRES_URL", url!);
    vi.stubEnv("DATABASE_URL", url!);
    await bootstrapReportTests(db);
    const [c] =
      await db`select id from task_committees where org_id=${org} and is_hr`;
    committee = c.id;
    await db`insert into task_committee_members(committee_id,profile_id) values(${committee},${hr}) on conflict do nothing`;
    await db`insert into auth.users(id) values(${pm}) on conflict do nothing`;
    await db`insert into profiles(id,org_id,email,full_name,role) values(${pm},${org},'manager@example.test','QA Manager','property_manager') on conflict do nothing`;
    const [p] =
      await db`insert into properties(org_id,name,slug,code) values(${org},'HR Report QA','hr-report-qa','HR-REPORT-QA') on conflict(code) do update set name=excluded.name returning id`;
    property = p.id;
    await db`insert into property_assignments(user_id,property_id) values(${pm},${property}) on conflict do nothing`;
    const [r] =
      await db`insert into fleet_requests(org_id,requested_by,report_owner_id,request_type,target_property_id,start_date,end_date,status) values(${org},${admin},${hr},'standalone',${property},current_date,current_date,'completed') returning id`;
    id = r.id;
    await db`insert into fleet_trip_reports(org_id,request_id,submitted_by,due_at) values(${org},${id},${hr},now()+interval '48 hours')`;
  });
  afterAll(() => db.end());
  it("creates an empty HR committee without adopting a same-named group", async () => {
    const { db: appDb } = await import("@/lib/db");
    const { sql } = await import("drizzle-orm");
    const { templates } = await import("./service");
    await expect(
      appDb.transaction(async (tx) => {
        const orgId = crypto.randomUUID();
        await tx.execute(
          sql`insert into organizations(id,name,slug) values(${orgId}::uuid,'Collision QA',${orgId})`,
        );
        const [old] = await tx.execute(
          sql`insert into task_committees(org_id,name,archived_at) values(${orgId}::uuid,'HQ HR',now()) returning id`,
        );
        await templates(tx, orgId);
        const rows = await tx.execute(
          sql`select id,is_hr,archived_at from task_committees where org_id=${orgId}::uuid`,
        );
        expect(rows.filter((r) => r.id === old.id || r.is_hr)).toHaveLength(2);
        expect(rows.find((r) => r.id === old.id)?.is_hr).toBe(false);
        expect(rows.find((r) => r.id === old.id)?.archived_at).toBeTruthy();
        const fresh = rows.find((r) => r.is_hr)!;
        expect(fresh.archived_at).toBeNull();
        const members = await tx.execute(
          sql`select 1 from task_committee_members where committee_id=${fresh.id}::uuid`,
        );
        expect(members).toHaveLength(0);
        throw Error("rollback-collision-fixture");
      }),
    ).rejects.toThrow("rollback-collision-fixture");
  });
  it("starts HR reports for members and isolates confidential answers from shared reads", async () => {
    const { startReport, readReport } = await import("./service");
    const { readPrivateFeedback, savePrivateFeedback } = await import("./hr");
    await startReport(hr, id, { key: "hr", propertyId: property });
    const shared = await readReport(hr, id);
    expect(shared.answers).toHaveLength(27);
    const { answerSchema } = await import("./model");
    const answers = ["private-feedback", "private-assessment"].map(
      (questionId) =>
        answerSchema.parse({
          id: crypto.randomUUID(),
          questionId,
          instance: "conversation-1",
          location: "HK — anonymous",
          notes: "PRIVATE-SENTINEL",
        }),
    );
    privateAnswer = answers[0].id;
    await savePrivateFeedback(hr, id, { version: 0, answers });
    expect((await readPrivateFeedback(hr, id)).answers).toHaveLength(2);
    const manager = await readReport(pm, id);
    expect(JSON.stringify(manager)).not.toContain("PRIVATE-SENTINEL");
    expect(manager.answers).toHaveLength(27);
    expect(manager.canViewConfidential).toBe(false);
    await expect(readPrivateFeedback(pm, id)).rejects.toThrow(/HR/i);
    await expect(
      savePrivateFeedback(hr, id, { version: 0, answers }),
    ).rejects.toThrow(/changed/i);
  });
  it("preserves private answers on shared save and blocks shared task links in private notes", async () => {
    const { readReport, saveReport } = await import("./service");
    const { readPrivateFeedback, savePrivateFeedback } = await import("./hr");
    const shared = await readReport(hr, id);
    await saveReport(hr, id, {
      version: shared.report.version,
      content: shared.content,
      answers: shared.answers,
    });
    const notes = await readPrivateFeedback(hr, id);
    expect(notes.answers).toHaveLength(2);
    const before = (await readReport(pm, id)).report.version;
    await savePrivateFeedback(hr, id, {
      version: notes.version,
      answers: notes.answers.map((a) => ({ ...a, notes: "PRIVATE-REVISION" })),
    });
    expect((await readReport(pm, id)).report.version).toBe(before);
    const forbidden = notes.answers.map((a) => ({
      ...a,
      task: {
        kind: "new",
        title: "private content",
        description: "",
        projectId: null,
        assigneeIds: [],
        dueDate: null,
        priority: "medium",
      },
    }));
    await expect(
      savePrivateFeedback(hr, id, {
        version: notes.version + 1,
        answers: forbidden,
      }),
    ).rejects.toThrow(/shared tasks/i);
  });
  it("keeps shared acknowledgement and notifications unchanged after private edits", async () => {
    const { readReport, saveReport, acknowledgeReport } =
      await import("./service");
    const { readPrivateFeedback, savePrivateFeedback } = await import("./hr");
    const page = await readReport(hr, id);
    const answers = page.answers.map((a) => {
      const kind = page.template!.questions.find(
        (q) => q.id === a.questionId,
      )!.kind;
      return {
        ...a,
        notes: "Inspected",
        rating: kind === "inspection" ? null : 4,
        location: kind === "employee_score" ? "Employee QA" : a.location,
        evaluation:
          kind === "employee_score"
            ? { department: "HK", feedback: "Continue good work" }
            : a.evaluation,
      };
    });
    await saveReport(hr, id, {
      version: page.report.version,
      content: {
        ...page.content,
        summary: "HR review complete",
        visitType: page.template!.visitTypes[0],
        visitDate: "2026-09-25",
        coEvaluator: "QA Property Head",
      },
      answers,
      submit: true,
    });
    const shared = await readReport(pm, id);
    await acknowledgeReport(pm, id, shared.report.version);
    const before = await readReport(pm, id);
    const notes = await readPrivateFeedback(hr, id);
    await savePrivateFeedback(hr, id, {
      version: notes.version,
      answers: notes.answers.map((a) => ({
        ...a,
        notes: "CONFIDENTIAL-AFTER-ACK",
      })),
    });
    const after = await readReport(pm, id);
    expect(after.report.version).toBe(before.report.version);
    expect(after.acknowledgements).toEqual(before.acknowledgements);
    expect(after.history).toEqual(before.history);
    expect(JSON.stringify(after)).not.toContain("CONFIDENTIAL-AFTER-ACK");
    await db`update fleet_trip_reports set due_at=now()-interval '1 second' where request_id=${id}`;
    await expect(
      savePrivateFeedback(hr, id, {
        version: notes.version + 1,
        answers: notes.answers,
      }),
    ).rejects.toThrow(/48-hour/i);
    await db`update fleet_trip_reports set due_at=now()+interval '48 hours' where request_id=${id}`;
  });
  it("rejects private photos for managers and revokes former member access immediately", async () => {
    const { reservePhoto, photoAction } = await import("./photos");
    const { readPrivateFeedback } = await import("./hr");
    await expect(
      reservePhoto(pm, id, privateAnswer, "secret.jpg", "image/jpeg", 10),
    ).rejects.toThrow();
    const p = await reservePhoto(
      hr,
      id,
      privateAnswer,
      "secret.jpg",
      "image/jpeg",
      10,
    );
    await db`update visit_report_photos set state='ready' where id=${p.id}`;
    await expect(photoAction(pm, id, p.id)).rejects.toThrow(/HR/i);
    await db`delete from task_committee_members where committee_id=${committee} and profile_id=${hr}`;
    await expect(readPrivateFeedback(hr, id)).rejects.toThrow(/not found|HR/i);
    await expect(photoAction(hr, id, p.id)).rejects.toThrow(/not found|HR/i);
  });
});
