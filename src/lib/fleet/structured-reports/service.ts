import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loadActor, TaskError, taskVisibility } from "@/lib/tasks/access";
import { recordTaskActor } from "@/lib/tasks/actor-context";
import { getWorkflowTask } from "@/lib/tasks/queries";
import { isReportEditingOpen } from "../reports";
import {
  templateSchema,
  contentSchema,
  saveSchema,
  validateAnswers,
  reportTemplates,
  type ReportTemplate,
  type Answer,
  type ReportContent,
} from "./model";
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = {
  id: string;
  org_id: string;
  request_id: string;
  submitted_by: string;
  submitted_at: Date | null;
  due_at: Date | null;
  reporting_task_id: string | null;
  template_snapshot: ReportTemplate | null;
  template_version: number | null;
  report_version: number;
  private_version: number;
  structured_content: ReportContent;
  report_property_id: string | null;
  draft: unknown;
  summary: string | null;
};
type Context = {
  r: Row;
  request: {
    status: string;
    requested_by: string;
    target_property_id: string | null;
    end_date: string;
  };
  actor: Awaited<ReturnType<typeof loadActor>>;
  manager: boolean;
  hr: boolean;
};
export async function context(
  tx: Tx,
  user: string,
  requestId: string,
  edit = false,
): Promise<Context> {
  const [request] = await tx.execute(
    sql`select * from fleet_requests where id=${requestId}::uuid for update`,
  );
  const [row] = await tx.execute(
    sql`select * from fleet_trip_reports where request_id=${requestId}::uuid for update`,
  );
  const actor = await loadActor(user, tx);
  if (!row || !request || row.org_id !== actor.orgId)
    throw new TaskError("Report not found", 404);
  const r = row as unknown as Row;
  const [profile] = await tx.execute(
    sql`select role,is_fleet_admin from profiles where id=${user}::uuid`,
  );
  const property =
    r.report_property_id ?? String(request.target_property_id ?? "");
  const [m] = property
    ? await tx.execute(
        sql`select 1 from properties p where p.id=${property}::uuid and p.org_id=${actor.orgId}::uuid and (p.primary_pm_id=${user}::uuid or (${profile.role === "property_manager"} and exists(select 1 from property_assignments a where a.property_id=p.id and a.user_id=${user}::uuid)))`,
      )
    : [];
  const [hrCommittee] = await tx.execute(
    sql`select id from task_committees where org_id=${actor.orgId}::uuid and is_hr and archived_at is null for share`,
  );
  const hr =
    actor.isAdmin ||
    (!!hrCommittee && actor.committeeIds.includes(String(hrCommittee.id)));
  if (r.template_snapshot?.key === "hr" && !hr && !m)
    throw new TaskError("Report not found", 404);
  if (!(
    (hr && r.template_snapshot?.key === "hr") ||
    actor.isAdmin ||
    profile.is_fleet_admin ||
    r.submitted_by === user ||
    request.requested_by === user ||
    m
  ))
    throw new TaskError("Report not found", 404);
  if (edit) {
    if (r.template_snapshot?.key === "hr" && !hr)
      throw new TaskError("HQ HR membership required", 403);
    if (r.submitted_by !== user)
      throw new TaskError("Only the report owner can edit", 403);
    if (request.status === "cancelled")
      throw new TaskError("This ride is cancelled", 409);
    if (!isReportEditingOpen(r.due_at ? new Date(r.due_at) : null))
      throw new TaskError("The 48-hour editing window has closed", 409);
  }
  return { r, request: request as Context["request"], actor, manager: !!m, hr };
}
export async function event(
  tx: Tx,
  r: Row,
  user: string,
  kind: string,
  before: unknown,
  after: unknown,
  visibility: "shared" | "hr" = "shared",
) {
  await tx.execute(
    sql`insert into visit_report_events(report_id,actor_id,kind,before_value,after_value,visibility) values(${r.id}::uuid,${user}::uuid,${kind},${JSON.stringify(before)}::jsonb,${JSON.stringify(after)}::jsonb,${visibility})`,
  );
}
export async function templates(tx: Tx, org: string) {
  // Lazy initialization also supports organizations created after the migration.
  await tx.execute(
    sql`insert into task_committees(org_id,name,is_hr) select ${org}::uuid,case when exists(select 1 from task_committees where org_id=${org}::uuid and name='HQ HR') then 'HQ HR (Visit Reports ' || gen_random_uuid()::text || ')' else 'HQ HR' end,true where not exists(select 1 from task_committees where org_id=${org}::uuid and is_hr) on conflict do nothing`,
  );
  for (const t of reportTemplates)
    await tx.execute(
      sql`insert into visit_report_templates(org_id,key,definition) values(${org}::uuid,${t.key},${JSON.stringify(t)}::jsonb) on conflict(org_id,key,version) do nothing`,
    );
  return await tx.execute(
    sql`select distinct on(key) key,version,definition from visit_report_templates where org_id=${org}::uuid order by key,version desc`,
  );
}
export async function readReport(user: string, requestId: string) {
  return db.transaction(async (tx) => {
    const c = await context(tx, user, requestId),
      { r, actor } = c;
    const rows = await tx.execute(
      sql`select * from visit_report_answers where report_id=${r.id}::uuid and removed_at is null and not is_confidential order by question_id,instance`,
    );
    const answers: Answer[] = rows.map((a) => ({
      id: String(a.id),
      questionId: String(a.question_id),
      instance: String(a.instance),
      location: String(a.location),
      notes: String(a.notes),
      rating:
        a.not_applicable &&
        r.template_snapshot?.questions.find((q) => q.id === a.question_id)
          ?.kind === "score"
          ? "na"
          : (a.rating as number | null),
      notApplicable: Boolean(a.not_applicable),
      evaluation: a.evaluation as Answer["evaluation"],
      task: a.task_id
        ? { kind: "existing", taskId: String(a.task_id) }
        : (a.task_plan as Answer["task"]),
    }));
    const photoRows = await tx.execute(
      sql`select p.id,p.answer_id "answerId",p.name,p.state from visit_report_photos p join visit_report_answers a on a.id=p.answer_id where a.report_id=${r.id}::uuid and a.removed_at is null and not a.is_confidential and p.state='ready' order by p.created_at`,
    );
    const acks = await tx.execute(
      sql`select a.profile_id "profileId",p.full_name name,a.report_version version,a.acknowledged_at "acknowledgedAt",a.assigned_at "assignedAt" from visit_report_acknowledgements a join profiles p on p.id=a.profile_id where a.report_id=${r.id}::uuid and a.report_version=${r.report_version} order by p.full_name`,
    );
    const options = await tx.execute(
      sql`select t.id,t.title from tasks t where ${taskVisibility(actor)} and t.archived_at is null and t.id<>coalesce(${r.reporting_task_id}::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by t.title limit 500`,
    );
    const projects = await tx.execute(
      sql`select j.id,j.name from projects j where j.org_id=${actor.orgId}::uuid and j.status='active' and (${actor.isAdmin} or j.created_by=${user}::uuid or exists(select 1 from tasks t where t.project_id=j.id and ${taskVisibility(actor)})) order by j.name`,
    );
    const people = await tx.execute(
      sql`select id,full_name name from profiles where org_id=${actor.orgId}::uuid and is_active order by full_name`,
    );
    const properties = await tx.execute(
      sql`select id,name from properties where org_id=${actor.orgId}::uuid and is_active order by name`,
    );
    const history = await tx.execute(
      sql`select e.id,e.kind,e.created_at,p.full_name actor from visit_report_events e join profiles p on p.id=e.actor_id where e.report_id=${r.id}::uuid and e.visibility='shared' order by e.created_at desc limit 100`,
    );
    return {
      report: {
        id: r.id,
        version: r.report_version,
        submittedAt: r.submitted_at,
        dueAt: r.due_at,
        propertyId: r.report_property_id ?? c.request.target_property_id,
      },
      template: r.template_snapshot,
      canViewConfidential: r.template_snapshot?.key === "hr" && c.hr,
      content: contentSchema.parse({
        ...r.structured_content,
        visitDate: r.structured_content.visitDate ?? c.request.end_date,
      }),
      answers,
      photos: photoRows as unknown as {
        id: string;
        answerId: string;
        name: string;
        state: string;
      }[],
      acknowledgements: acks as unknown as {
        profileId: string;
        name: string;
        version: number;
        acknowledgedAt: string | null;
        assignedAt: string;
      }[],
      history,
      templates: (await templates(tx, actor.orgId))
        .filter((t) => t.key !== "hr" || c.hr)
        .map((t) => ({
          key: String(t.key),
          version: Number(t.version),
          name: (t.definition as ReportTemplate).name,
        })),
      taskOptions: options as unknown as { id: string; title: string }[],
      projects: projects as unknown as { id: string; name: string }[],
      people: people as unknown as { id: string; name: string }[],
      properties: properties as unknown as { id: string; name: string }[],
      canEdit:
        (r.template_snapshot?.key !== "hr" || c.hr) &&
        r.submitted_by === user &&
        c.request.status !== "cancelled" &&
        isReportEditingOpen(r.due_at ? new Date(r.due_at) : null),
      canSubmit: c.request.status === "completed",
      canAcknowledge:
        c.manager &&
        !!r.submitted_at &&
        acks.some((a) => a.profileId === user && !a.acknowledgedAt),
      hasLegacyContent: !!r.draft || !!r.summary,
      userId: user,
      authorName:
        people.find((p) => p.id === r.submitted_by)?.name ?? "Report owner",
    };
  });
}
export async function startReport(
  user: string,
  requestId: string,
  input: { key: string; propertyId: string },
) {
  return db.transaction(async (tx) => {
    const { r, actor, request, hr } = await context(tx, user, requestId, true);
    if (input.key === "hr" && !hr)
      throw new TaskError("HQ HR membership required", 403);
    if (r.template_snapshot)
      throw new TaskError("A template is already selected", 409);
    if (r.submitted_at || r.draft || r.summary)
      throw new TaskError(
        "This report already has legacy content; continue with its existing form",
        409,
      );
    const [property] = await tx.execute(
      sql`select id from properties where id=${input.propertyId}::uuid and org_id=${actor.orgId}::uuid and is_active for share`,
    );
    if (
      !property ||
      (request.target_property_id &&
        request.target_property_id !== input.propertyId)
    )
      throw new TaskError("Choose the ride property", 400);
    const t = (await templates(tx, actor.orgId)).find(
      (t) => t.key === input.key,
    );
    if (!t) throw new TaskError("Category not found", 404);
    const definition = templateSchema.parse(t.definition);
    await tx.execute(
      sql`update fleet_trip_reports set template_snapshot=${JSON.stringify(definition)}::jsonb,template_version=${t.version},report_property_id=${input.propertyId}::uuid,report_version=report_version+1,updated_at=now() where id=${r.id}::uuid`,
    );
    for (const q of definition.questions.filter(
      (q) => q.kind !== "confidential",
    ))
      await tx.execute(
        sql`insert into visit_report_answers(id,report_id,question_id,location) values(${crypto.randomUUID()}::uuid,${r.id}::uuid,${q.id},${q.kind === "employee_score" ? "" : "Property-wide"})`,
      );
    await event(tx, r, user, "template_selected", null, {
      template: definition,
      version: t.version,
      propertyId: input.propertyId,
    });
  });
}
async function resolveTask(tx: Tx, c: Context, a: Answer, create: boolean) {
  if (a.task.kind === "none") return null;
  if (a.task.kind === "existing") {
    if (a.task.taskId === c.r.reporting_task_id)
      throw new TaskError("The reporting task cannot be a follow-up task");
    const [retained] = await tx.execute(
      sql`select task_id from visit_report_answers where id=${a.id}::uuid and report_id=${c.r.id}::uuid and task_id=${a.task.taskId}::uuid and removed_at is null`,
    );
    if (retained) return String(retained.task_id);
    const t = await getWorkflowTask(c.actor, a.task.taskId, false, tx);
    if (t.archived_at) throw new TaskError("Choose an active task");
    return t.id;
  }
  if (!create) return null;
  const f = a.task;
  if (!f.title) throw new TaskError("Enter a new task title");
  if (f.projectId) {
    const [p] = await tx.execute(
      sql`select j.id from projects j where j.id=${f.projectId}::uuid and j.org_id=${c.actor.orgId}::uuid and j.status='active' and (${c.actor.isAdmin} or j.created_by=${c.actor.profileId}::uuid or exists(select 1 from tasks t where t.project_id=j.id and ${taskVisibility(c.actor)})) for share`,
    );
    if (!p) throw new TaskError("Choose an accessible active project");
  }
  const [t] = await tx.execute(
    sql`insert into tasks(org_id,project_id,property_id,title,description,priority,due_date,created_by) values(${c.actor.orgId}::uuid,${f.projectId}::uuid,${c.r.report_property_id}::uuid,${f.title},${`${f.description}\nVisit report: /fleet/reports/${c.r.request_id}\nQuestion: ${a.questionId}${c.r.template_snapshot?.key === "hr" ? "" : "; location: " + a.location}`},${f.priority}::task_priority,${f.dueDate}::date,${c.actor.profileId}::uuid) returning id`,
  );
  // Keep travelling authors able to follow up even when they do not belong to
  // this property's Operations team.
  const assignees = new Set(f.assigneeIds);
  if (
    !c.actor.isAdmin &&
    !c.actor.propertyIds.includes(c.r.report_property_id ?? "") &&
    !c.actor.committeeIds.includes(c.actor.operationsCommitteeId)
  )
    assignees.add(c.actor.profileId);
  for (const id of assignees)
    await tx.execute(
      sql`insert into task_assignees(task_id,profile_id) values(${t.id}::uuid,${id}::uuid)`,
    );
  return String(t.id);
}
export async function assignAcknowledgements(
  tx: Tx,
  r: Row,
  version: number,
  actorId: string,
) {
  const managers = await tx.execute(
    sql`select p.id from profiles p join properties x on x.org_id=p.org_id where x.id=${r.report_property_id}::uuid and p.is_active and (x.primary_pm_id=p.id or (p.role='property_manager' and exists(select 1 from property_assignments a where a.property_id=x.id and a.user_id=p.id))) for share of p`,
  );
  for (const m of managers) {
    await event(tx, r, actorId, "acknowledgement_assigned", null, {
      profileId: m.id,
      version,
    });
    await tx.execute(
      sql`insert into visit_report_acknowledgements(report_id,profile_id,report_version) values(${r.id}::uuid,${m.id}::uuid,${version}) on conflict(report_id,profile_id) do update set report_version=excluded.report_version,acknowledged_at=null,assigned_at=now()`,
    );
    await tx.execute(
      sql`insert into notifications(org_id,profile_id,type,title,body,link_url,channel,sent_at) values(${r.org_id}::uuid,${m.id}::uuid,'visit_report','Visit report awaiting your acknowledgement','Please read the submitted visit report and acknowledge it.',${"/fleet/reports/" + r.request_id},'in_app',now())`,
    );
  }
}
export async function saveReport(
  user: string,
  requestId: string,
  input: unknown,
) {
  const data = saveSchema.parse(input);
  return db.transaction(async (tx) => {
    const c = await context(tx, user, requestId, true),
      { r } = c;
    if (!r.template_snapshot)
      throw new TaskError("Select a report category first");
    if (r.report_version !== data.version)
      throw new TaskError("The report changed. Reload before saving.", 409);
    const complete = data.submit || !!r.submitted_at;
    try {
      validateAnswers(r.template_snapshot, data.answers, complete);
    } catch (e) {
      throw new TaskError((e as Error).message);
    }
    if (data.submit && c.request.status !== "completed")
      throw new TaskError("The ride must be completed before submission");
    if (
      complete &&
      (!data.content.summary ||
        !data.content.visitDate ||
        !r.template_snapshot.visitTypes.includes(data.content.visitType))
    )
      throw new TaskError("Complete the summary, visit date and visit type");
    if (
      complete &&
      r.template_snapshot.key === "hr" &&
      !data.content.coEvaluator
    )
      throw new TaskError(
        "Enter the Property Head / 2nd IC who co-evaluated staff",
      );
    await recordTaskActor(tx, user, "Structured visit report");
    const old = await tx.execute(
      sql`select * from visit_report_answers where report_id=${r.id}::uuid and removed_at is null and not is_confidential`,
    );
    const ids = data.answers.map((a) => a.id);
    for (const a of data.answers) {
      const [existing] = await tx.execute(
        sql`select report_id,question_id,instance from visit_report_answers where id=${a.id}::uuid`,
      );
      if (
        existing &&
        (existing.report_id !== r.id ||
          existing.question_id !== a.questionId ||
          existing.instance !== a.instance)
      )
        throw new TaskError("Answer identity cannot be changed", 409);
      const taskId = await resolveTask(tx, c, a, complete);
      await tx.execute(
        sql`insert into visit_report_answers(id,report_id,question_id,instance,location,notes,rating,not_applicable,task_id,task_plan,evaluation) values(${a.id}::uuid,${r.id}::uuid,${a.questionId},${a.instance},${a.location},${a.notes},${typeof a.rating === "number" ? a.rating : null},${a.notApplicable || a.rating === "na"},${taskId}::uuid,${JSON.stringify(taskId ? { kind: "existing", taskId } : a.task)}::jsonb,${JSON.stringify(a.evaluation)}::jsonb) on conflict(id) do update set location=excluded.location,notes=excluded.notes,rating=excluded.rating,not_applicable=excluded.not_applicable,task_id=excluded.task_id,task_plan=excluded.task_plan,evaluation=excluded.evaluation,updated_at=now(),removed_at=null`,
      );
      if (taskId)
        await tx.execute(
          sql`insert into fleet_report_task_links(org_id,report_id,task_id) values(${r.org_id}::uuid,${r.id}::uuid,${taskId}::uuid) on conflict(report_id,task_id) do nothing`,
        );
    }
    for (const a of old)
      if (!ids.includes(String(a.id))) {
        await tx.execute(
          sql`insert into task_file_cleanup(storage_path) select storage_path from visit_report_photos where answer_id=${a.id}::uuid and state<>'removed' on conflict do nothing`,
        );
        await tx.execute(
          sql`update visit_report_photos set state='removed' where answer_id=${a.id}::uuid`,
        );
        await tx.execute(
          sql`update visit_report_answers set removed_at=now() where id=${a.id}::uuid`,
        );
      }
    const version = r.report_version + 1;
    await tx.execute(
      sql`update fleet_trip_reports set structured_content=${JSON.stringify(data.content)}::jsonb,summary=${data.content.summary},report_version=${version},submitted_at=case when ${data.submit} then coalesce(submitted_at,now()) else submitted_at end,updated_at=now() where id=${r.id}::uuid`,
    );
    if (data.submit && !r.submitted_at && r.reporting_task_id)
      await tx.execute(
        sql`update tasks set status='done' where id=${r.reporting_task_id}::uuid and org_id=${r.org_id}::uuid`,
      );
    const stored = await tx.execute(
      sql`select * from visit_report_answers where report_id=${r.id}::uuid and removed_at is null and not is_confidential`,
    );
    await event(
      tx,
      r,
      user,
      data.submit ? "submitted" : "saved",
      { content: r.structured_content, answers: old },
      { content: data.content, answers: stored, version },
    );
    if (complete) await assignAcknowledgements(tx, r, version, user);
    return { version };
  });
}
export async function acknowledgeReport(
  user: string,
  requestId: string,
  version: number,
) {
  return db.transaction(async (tx) => {
    const { r, manager } = await context(tx, user, requestId);
    if (!r.submitted_at || !manager)
      throw new TaskError(
        "Only the assigned property manager can acknowledge this report",
        403,
      );
    if (r.report_version !== version)
      throw new TaskError(
        "The report changed. Read the latest version first.",
        409,
      );
    const [ack] = await tx.execute(
      sql`update visit_report_acknowledgements set acknowledged_at=now() where report_id=${r.id}::uuid and profile_id=${user}::uuid and report_version=${version} and acknowledged_at is null returning profile_id`,
    );
    const [assigned] = await tx.execute(
      sql`select 1 from visit_report_acknowledgements where report_id=${r.id}::uuid and profile_id=${user}::uuid and report_version=${version}`,
    );
    if (!assigned) throw new TaskError("No acknowledgement assigned", 403);
    if (ack) await event(tx, r, user, "acknowledged", null, { version });
    return { acknowledged: true };
  });
}
export async function publishTemplate(user: string, input: unknown) {
  const parsed = z
    .object({ version: z.number().int().min(1), definition: templateSchema })
    .parse(input);
  return db.transaction(async (tx) => {
    const a = await loadActor(user, tx);
    if (!a.isAdmin) throw new TaskError("Admins only", 403);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${a.orgId + ":" + parsed.definition.key}))`,
    );
    const [latest] = await tx.execute(
      sql`select version from visit_report_templates where org_id=${a.orgId}::uuid and key=${parsed.definition.key} order by version desc limit 1`,
    );
    if (!latest || Number(latest.version) !== parsed.version)
      throw new TaskError("Template changed; reload before publishing", 409);
    await tx.execute(
      sql`insert into visit_report_templates(org_id,key,version,definition,created_by) values(${a.orgId}::uuid,${parsed.definition.key},${parsed.version + 1},${JSON.stringify(parsed.definition)}::jsonb,${user}::uuid)`,
    );
  });
}
