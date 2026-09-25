import { z } from "zod/v4";
import { requestActor, errorResponse } from "@/lib/tasks/access";
import {
  readReport,
  startReport,
  saveReport,
  acknowledgeReport,
} from "@/lib/fleet/structured-reports/service";
type C = { params: Promise<{ requestId: string }> };
async function identity(c: C) {
  return {
    user: (await requestActor()).profileId,
    id: z.uuid().parse((await c.params).requestId),
  };
}
export async function GET(_r: Request, c: C) {
  try {
    const { user, id } = await identity(c);
    return Response.json(await readReport(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request, c: C) {
  try {
    const { user, id } = await identity(c);
    const data = z
      .object({ key: z.string().max(80), propertyId: z.uuid() })
      .parse(await r.json());
    await startReport(user, id, data);
    return Response.json(await readReport(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(r: Request, c: C) {
  try {
    const { user, id } = await identity(c);
    await saveReport(user, id, await r.json());
    return Response.json(await readReport(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(r: Request, c: C) {
  try {
    const { user, id } = await identity(c);
    const { version } = z
      .object({ version: z.number().int().min(0) })
      .parse(await r.json());
    await acknowledgeReport(user, id, version);
    return Response.json(await readReport(user, id));
  } catch (e) {
    return errorResponse(e);
  }
}
