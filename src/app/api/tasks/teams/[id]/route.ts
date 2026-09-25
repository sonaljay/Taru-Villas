export async function PATCH() {
  return Response.json(
    { error: 'Teams have been replaced by Committees.' },
    { status: 410 },
  )
}
export const DELETE = PATCH
