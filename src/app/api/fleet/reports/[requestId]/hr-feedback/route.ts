import { z } from "zod/v4";
import { requestActor, errorResponse } from "@/lib/tasks/access";
import {
  readPrivateFeedback,
  savePrivateFeedback,
} from "@/lib/fleet/structured-reports/hr";
type C = { params: Promise<{ requestId: string }> };
export async function GET(_r: Request, c: C) {
  try {
    const user = (await requestActor()).profileId,
      id = z.uuid().parse((await c.params).requestId);
    return Response.json(await readPrivateFeedback(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(r: Request, c: C) {
  try {
    const user = (await requestActor()).profileId,
      id = z.uuid().parse((await c.params).requestId);
    await savePrivateFeedback(user, id, await r.json());
    return Response.json(await readPrivateFeedback(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
