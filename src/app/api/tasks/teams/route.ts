export async function GET() {
  return Response.json(
    { error: 'Teams have been replaced by Committees.' },
    { status: 410 },
  )
}
export const POST = GET
