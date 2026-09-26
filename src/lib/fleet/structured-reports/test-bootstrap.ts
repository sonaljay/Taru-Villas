import type postgres from "postgres";
import { readFileSync } from "node:fs";
export async function bootstrapReportTests(db: ReturnType<typeof postgres>) {
  await db.begin(async (tx) => {
    await tx.unsafe("select pg_advisory_xact_lock(554390036)");
    const [old] = await tx.unsafe(
      "select to_regclass('visit_report_templates') present",
    );
    if (!old.present)
      await tx.unsafe(
        readFileSync("drizzle/0035_visit_report_templates.sql", "utf8").replace(
          /^BEGIN;|^COMMIT;/gm,
          "",
        ),
      );
    const [hr] = await tx.unsafe(
      "select 1 from information_schema.columns where table_name='task_committees' and column_name='is_hr'",
    );
    if (!hr)
      await tx.unsafe(
        readFileSync("drizzle/0036_hr_visit_reports.sql", "utf8").replace(
          /^BEGIN;|^COMMIT;/gm,
          "",
        ),
      );
  });
}
