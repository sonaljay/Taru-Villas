import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TaskError } from "@/lib/tasks/access";
import { answerSchema } from "./model";
import { context, event } from "./service";
const privateSchema = z.object({
  version: z.number().int().min(0),
  answers: z.array(answerSchema).max(200),
});
export async function privateContext(
  tx: Parameters<typeof context>[0],
  user: string,
  id: string,
  edit = false,
) {
  const c = await context(tx, user, id, edit);
  if (c.r.template_snapshot?.key !== "hr" || !c.hr)
    throw new TaskError("HQ HR membership required", 403);
  return c;
}
export async function readPrivateFeedback(user: string, id: string) {
  return db.transaction(async (tx) => {
    const c = await privateContext(tx, user, id);
    const rows = await tx.execute(
      sql`select * from visit_report_answers where report_id=${c.r.id}::uuid and is_confidential and removed_at is null order by instance,question_id`,
    );
    const photos = await tx.execute(
      sql`select p.id,p.answer_id "answerId",p.name from visit_report_photos p join visit_report_answers a on a.id=p.answer_id where a.report_id=${c.r.id}::uuid and a.is_confidential and a.removed_at is null and p.state='ready' order by p.created_at`,
    );
    const history = await tx.execute(
      sql`select e.id,e.kind,e.created_at,p.full_name actor from visit_report_events e join profiles p on p.id=e.actor_id where e.report_id=${c.r.id}::uuid and e.visibility='hr' order by e.created_at desc limit 100`,
    );
    return {
      version: c.r.private_version,
      answers: rows.map((a) =>
        answerSchema.parse({
          id: a.id,
          questionId: a.question_id,
          instance: a.instance,
          location: a.location,
          notes: a.notes,
        }),
      ),
      photos: photos as unknown as {
        id: string;
        answerId: string;
        name: string;
      }[],
      history,
    };
  });
}
export async function savePrivateFeedback(
  user: string,
  id: string,
  input: unknown,
) {
  const data = privateSchema.parse(input);
  return db.transaction(async (tx) => {
    const c = await privateContext(tx, user, id, true),
      { r } = c;
    if (data.version !== r.private_version)
      throw new TaskError(
        "Private feedback changed. Reload before saving.",
        409,
      );
    const questions = r.template_snapshot!.questions.filter(
        (q) => q.kind === "confidential",
      ),
      seen = new Set<string>(),
      ids = new Set<string>();
    for (const a of data.answers) {
      if (!questions.some((q) => q.id === a.questionId))
        throw new TaskError("Unknown confidential question");
      if (a.task.kind !== "none")
        throw new TaskError(
          "Confidential feedback cannot create or link shared tasks",
        );
      if (a.rating !== null || a.notApplicable)
        throw new TaskError("Confidential feedback uses written notes");
      const key = a.instance + ":" + a.questionId;
      if (seen.has(key) || ids.has(a.id))
        throw new TaskError("Duplicate confidential answer");
      seen.add(key);
      ids.add(a.id);
    }
    for (const instance of new Set(data.answers.map((a) => a.instance)))
      if (
        questions.some(
          (q) =>
            !data.answers.some(
              (a) => a.instance === instance && a.questionId === q.id,
            ),
        )
      )
        throw new TaskError(
          "Keep all fields in each confidential conversation",
        );
    const before = await tx.execute(
      sql`select * from visit_report_answers where report_id=${r.id}::uuid and is_confidential and removed_at is null`,
    );
    for (const a of data.answers) {
      const [old] = await tx.execute(
        sql`select * from visit_report_answers where id=${a.id}::uuid`,
      );
      if (
        old &&
        (old.report_id !== r.id ||
          old.question_id !== a.questionId ||
          old.instance !== a.instance ||
          !old.is_confidential)
      )
        throw new TaskError("Answer identity cannot be changed", 409);
      await tx.execute(
        sql`insert into visit_report_answers(id,report_id,question_id,instance,location,notes) values(${a.id}::uuid,${r.id}::uuid,${a.questionId},${a.instance},${a.location},${a.notes}) on conflict(id) do update set location=excluded.location,notes=excluded.notes,removed_at=null,updated_at=now()`,
      );
    }
    for (const a of before)
      if (!ids.has(String(a.id))) {
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
    const version = r.private_version + 1;
    await tx.execute(
      sql`update fleet_trip_reports set private_version=${version} where id=${r.id}::uuid`,
    );
    await event(
      tx,
      r,
      user,
      "confidential_feedback_saved",
      { answers: before },
      { answers: data.answers, version },
      "hr",
    );
    return { version };
  });
}
