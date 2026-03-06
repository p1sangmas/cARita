export async function onRequestPut({ request, env }) {
  if (request.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN)
    return new Response('Unauthorized', { status: 401 });
  const index = new URL(request.url).searchParams.get('index');
  if (!index) return new Response('Missing index', { status: 400 });
  await env.R2.put(`targets/${index}/story.mp4`, request.body,
    { httpMetadata: { contentType: 'video/mp4' } });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}
