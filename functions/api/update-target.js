// PATCH /api/update-target
// Body: { index: number, message: string }
// Updates the caption text for an existing target — no recompile needed.
export async function onRequestPatch(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { index, message } = body;
  if (index === undefined || index === null) {
    return new Response('Missing index', { status: 400 });
  }

  const value = await env.KV.get('targets');
  const targets = value ? JSON.parse(value) : [];

  const target = targets.find(t => t.index === index);
  if (!target) return new Response('Target not found', { status: 404 });

  target.message = message || '';
  await env.KV.put('targets', JSON.stringify(targets));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
