// POST /api/upload-image — store image in R2, append target entry to KV
// Form fields: image (File), message (string)
// Returns: { index: number }
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

  const imageFile = formData.get('image');
  const message = formData.get('message') || '';

  if (!imageFile) {
    return new Response('Missing image field', { status: 400 });
  }

  // Determine next index from current KV state
  const value = await env.KV.get('targets');
  const targets = value ? JSON.parse(value) : [];
  const index = targets.length;

  // Write image to R2
  const imageBuffer = await imageFile.arrayBuffer();
  await env.R2.put(`targets/${index}/image.jpg`, imageBuffer, {
    httpMetadata: { contentType: imageFile.type || 'image/jpeg' },
  });

  // Append target metadata to KV (imageKey/videoKey track actual R2 paths after any reindex)
  targets.push({
    index,
    message,
    imageKey: `targets/${index}/image.jpg`,
    videoKey: `targets/${index}/video.mp4`,
  });
  await env.KV.put('targets', JSON.stringify(targets));

  return new Response(JSON.stringify({ index }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
