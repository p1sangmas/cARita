// GET /r2/* — proxy R2 objects to the browser
// Used by the AR app to stream videos and by the admin to fetch images for compilation.
export async function onRequestGet(context) {
  const { params, env } = context;
  // params.path is an array of URL segments after /r2/
  const key = params.path.join('/');

  const object = await env.R2.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }
  // Short cache — videos/images rarely change; admin recompile updates targets.mind separately
  headers.set('Cache-Control', 'public, max-age=300');

  return new Response(object.body, { headers });
}
