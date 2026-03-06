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
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Expose-Headers', 'Content-Type, Content-Length');

  return new Response(object.body, { headers });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '86400',
    },
  });
}
