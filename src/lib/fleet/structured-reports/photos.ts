import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { TaskError } from "@/lib/tasks/access";
import { context, event, assignAcknowledgements, type Tx } from "./service";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAttachment } from "@/lib/tasks/file-types";
async function changed(
  tx: Tx,
  c: Awaited<ReturnType<typeof context>>,
  user: string,
  kind: string,
  photo: unknown,
  privatePhoto = false,
) {
  if (privatePhoto) {
    await tx.execute(
      sql`update fleet_trip_reports set private_version=private_version+1 where id=${c.r.id}::uuid`,
    );
    await event(
      tx,
      c.r,
      user,
      kind,
      null,
      { photo, version: c.r.private_version + 1 },
      "hr",
    );
    return;
  }
  const version = c.r.report_version + 1;
  await tx.execute(
    sql`update fleet_trip_reports set report_version=${version},updated_at=now() where id=${c.r.id}::uuid`,
  );
  await event(tx, c.r, user, kind, null, { photo, version });
  if (c.r.submitted_at) await assignAcknowledgements(tx, c.r, version, user);
}
export async function reservePhoto(
  user: string,
  requestId: string,
  answerId: string,
  name: string,
  type: string,
  size: number,
) {
  return db.transaction(async (tx) => {
    const c = await context(tx, user, requestId, true);
    const [answer] = await tx.execute(
      sql`select id,is_confidential from visit_report_answers where id=${answerId}::uuid and report_id=${c.r.id}::uuid and removed_at is null`,
    );
    if (!answer)
      throw new TaskError("Save this question before adding photos", 409);
    if (answer.is_confidential && !c.hr)
      throw new TaskError("HQ HR membership required", 403);
    // Abandoned uploads already have durable cleanup intents; stop reserving their slots.
    await tx.execute(
      sql`update visit_report_photos set state='removed' where answer_id=${answerId}::uuid and state='uploading' and created_at<now()-interval '15 minutes'`,
    );
    const [count] = await tx.execute(
      sql`select count(*) n from visit_report_photos where answer_id=${answerId}::uuid and state in ('uploading','ready')`,
    );
    if (Number(count.n) >= 5)
      throw new TaskError("Each question allows up to five photos", 409);
    const path = `${c.r.org_id}/visit-reports/${c.r.id}/${crypto.randomUUID()}`;
    const [photo] = await tx.execute(
      sql`insert into visit_report_photos(answer_id,storage_path,name,content_type,size,actor_id) values(${answerId}::uuid,${path},${name.slice(0, 250)},${type},${size},${user}::uuid) returning id`,
    );
    await tx.execute(
      sql`insert into task_file_cleanup(storage_path) values(${path})`,
    );
    return { id: String(photo.id), path };
  });
}
export async function uploadPhoto(
  user: string,
  requestId: string,
  answerId: string,
  file: File,
) {
  if (file.size > 10485760) throw new TaskError("Photos must be at most 10 MB");
  const bytes = Buffer.from(await file.arrayBuffer());
  let type: string;
  try {
    type = validateAttachment(file.name, bytes);
    if (!type.startsWith("image/"))
      throw Error("Choose a JPEG, PNG or WebP photo");
  } catch (e) {
    throw new TaskError((e as Error).message);
  }
  const photo = await reservePhoto(
    user,
    requestId,
    answerId,
    file.name,
    type,
    bytes.length,
  );
  const storage = createAdminClient().storage.from("task-attachments");
  try {
    const result = await storage.upload(photo.path, bytes, {
      contentType: type,
      upsert: false,
    });
    if (result.error)
      throw new TaskError("Photo upload failed. Please try again.", 503);
    await db.transaction(async (tx) => {
      const c = await context(tx, user, requestId, true);
      const [ready] = await tx.execute(
        sql`update visit_report_photos p set state='ready' from visit_report_answers a where p.id=${photo.id}::uuid and p.state='uploading' and a.id=p.answer_id and a.removed_at is null and a.report_id=${c.r.id}::uuid returning p.id,p.name,a.is_confidential`,
      );
      if (ready?.is_confidential && !c.hr)
        throw new TaskError("HQ HR membership required", 403);
      if (!ready)
        throw new TaskError(
          "This question changed during upload. Reload the report.",
          409,
        );
      await tx.execute(
        sql`delete from task_file_cleanup where storage_path=${photo.path}`,
      );
      await changed(
        tx,
        c,
        user,
        "photo_added",
        ready,
        Boolean(ready.is_confidential),
      );
    });
  } catch (e) {
    await db.execute(
      sql`update visit_report_photos set state='removed' where id=${photo.id}::uuid and state='uploading'`,
    );
    // Cleanup remains queued even if immediate removal fails.
    await storage.remove([photo.path]).catch(() => undefined);
    throw e;
  }
  return { id: photo.id };
}
export async function photoAction(
  user: string,
  requestId: string,
  photoId: string,
  remove = false,
) {
  const result = await db.transaction(async (tx) => {
    const c = await context(tx, user, requestId, remove);
    const [p] = await tx.execute(
      sql`select p.*,a.is_confidential from visit_report_photos p join visit_report_answers a on a.id=p.answer_id where p.id=${photoId}::uuid and a.report_id=${c.r.id}::uuid and a.removed_at is null and p.state='ready'`,
    );
    if (p?.is_confidential && !c.hr)
      throw new TaskError("HQ HR membership required", 403);
    if (!p) throw new TaskError("Photo not found", 404);
    if (remove) {
      await tx.execute(
        sql`insert into task_file_cleanup(storage_path) values(${p.storage_path}) on conflict do nothing`,
      );
      await tx.execute(
        sql`update visit_report_photos set state='removed' where id=${photoId}::uuid`,
      );
      await changed(
        tx,
        c,
        user,
        "photo_removed",
        { id: p.id, name: p.name },
        Boolean(p.is_confidential),
      );
    }
    return String(p.storage_path);
  });
  const storage = createAdminClient().storage.from("task-attachments");
  if (remove) {
    await storage.remove([result]).catch(() => undefined);
    return { removed: true };
  }
  const signed = await storage.createSignedUrl(result, 60);
  if (signed.error) throw new TaskError("Photo unavailable", 503);
  return { url: signed.data.signedUrl };
}
