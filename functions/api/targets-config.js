// GET /api/targets-config — returns window.CARITA_TARGETS as a JS script
// Loaded as a synchronous blocking <script> in index.html so the AR scene
// can be built before A-Frame initialises.
export async function onRequestGet(context) {
  const value = await context.env.KV.get('targets');
  const json = value || '[]';
  return new Response(`window.CARITA_TARGETS = ${json};`, {
    headers: {
      'Content-Type': 'text/javascript',
      'Cache-Control': 'no-store',
    },
  });
}
