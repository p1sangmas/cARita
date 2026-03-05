// GET /api/targets — returns current target list from KV
export async function onRequestGet(context) {
  const value = await context.env.KV.get('targets');
  const targets = value ? JSON.parse(value) : [];
  return new Response(JSON.stringify(targets), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
