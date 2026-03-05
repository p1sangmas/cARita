// DELETE /api/delete-target?index=N
// Removes the target from KV, deletes its R2 files, and reindexes the
// remaining targets sequentially so the next compile stays consistent.
export async function onRequestDelete(context) {
  const { request, env } = context;

  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const deleteIndex = parseInt(url.searchParams.get('index'), 10);
  if (isNaN(deleteIndex)) return new Response('Missing index param', { status: 400 });

  const value = await env.KV.get('targets');
  const targets = value ? JSON.parse(value) : [];

  const toDelete = targets.find(t => t.index === deleteIndex);
  if (!toDelete) return new Response('Target not found', { status: 404 });

  // Remove R2 assets — swallow errors if files are already gone
  const imageKey = toDelete.imageKey || `targets/${deleteIndex}/image.jpg`;
  const videoKey = toDelete.videoKey || `targets/${deleteIndex}/video.mp4`;
  await Promise.all([
    env.R2.delete(imageKey).catch(() => {}),
    env.R2.delete(videoKey).catch(() => {}),
  ]);

  // Reindex remaining targets 0, 1, 2 … while keeping their original R2 keys
  // (R2 files are NOT renamed — imageKey/videoKey track the actual paths)
  const remaining = targets
    .filter(t => t.index !== deleteIndex)
    .map((t, i) => ({
      ...t,
      index: i,
      imageKey: t.imageKey || `targets/${t.index}/image.jpg`,
      videoKey: t.videoKey || `targets/${t.index}/video.mp4`,
    }));

  await env.KV.put('targets', JSON.stringify(remaining));

  return new Response(JSON.stringify(remaining), {
    headers: { 'Content-Type': 'application/json' },
  });
}
