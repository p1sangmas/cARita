// POST /api/upload-video — store video in R2
// Form fields: video (File), index (number returned by upload-image)
export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const videoFile = formData.get('video');
  const index = formData.get('index');

  if (!videoFile || index === null || index === undefined) {
    return new Response('Missing video or index field', { status: 400 });
  }

  const videoBuffer = await videoFile.arrayBuffer();
  await env.R2.put(`targets/${index}/video.mp4`, videoBuffer, {
    httpMetadata: { contentType: videoFile.type || 'video/mp4' },
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
