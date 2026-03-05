// GET /api/mind  — serve targets.mind from R2
// PUT /api/mind  — store new compiled targets.mind in R2 (admin-only)
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const object = await env.R2.get('targets.mind');
    if (!object) return new Response('targets.mind not found', { status: 404 });
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.method === 'PUT') {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    const buffer = await request.arrayBuffer();
    await env.R2.put('targets.mind', buffer);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method not allowed', { status: 405 });
}
