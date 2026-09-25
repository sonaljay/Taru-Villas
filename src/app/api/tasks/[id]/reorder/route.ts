export async function PATCH() {
  return Response.json(
    { error: 'Use the versioned task progress action.' },
    { status: 405 },
  )
}
