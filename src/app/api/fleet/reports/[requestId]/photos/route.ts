import { z } from "zod/v4";
import { requestActor, errorResponse, TaskError } from "@/lib/tasks/access";
import {
  uploadPhoto,
  photoAction,
} from "@/lib/fleet/structured-reports/photos";
type C = { params: Promise<{ requestId: string }> };
async function ids(c: C) {
  return {
    user: (await requestActor()).profileId,
    id: z.uuid().parse((await c.params).requestId),
  };
}
export async function POST(r: Request, c: C) {
  try {
    const { user, id } = await ids(c);
    if (Number(r.headers.get("content-length")) > 11 * 1024 * 1024)
      throw new TaskError("Photos must be at most 10 MB");
    const form = await r.formData();
    const answer = z.uuid().parse(form.get("answerId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new TaskError("Choose a photo");
    return Response.json(await uploadPhoto(user, id, answer, file), {
      status: 201,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(r: Request, c: C) {
  try {
    const { user, id } = await ids(c);
    const result = await photoAction(
      user,
      id,
      z.uuid().parse(new URL(r.url).searchParams.get("id")),
    );
    if (
      new URL(r.url).searchParams.get("view") === "1" &&
      "url" in result &&
      result.url
    )
      return Response.redirect(result.url);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(r: Request, c: C) {
  try {
    const { user, id } = await ids(c);
    return Response.json(
      await photoAction(
        user,
        id,
        z.uuid().parse(new URL(r.url).searchParams.get("id")),
        true,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
