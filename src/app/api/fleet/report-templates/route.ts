import { db } from "@/lib/db";
import { requestActor, errorResponse, TaskError } from "@/lib/tasks/access";
import {
  templates,
  publishTemplate,
} from "@/lib/fleet/structured-reports/service";
export async function GET() {
  try {
    const a = await requestActor();
    if (!a.isAdmin) throw new TaskError("Admins only", 403);
    return Response.json(await db.transaction((tx) => templates(tx, a.orgId)));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(r: Request) {
  try {
    const a = await requestActor();
    await publishTemplate(a.profileId, await r.json());
    return Response.json({ saved: true });
  } catch (e) {
    return errorResponse(e);
  }
}
