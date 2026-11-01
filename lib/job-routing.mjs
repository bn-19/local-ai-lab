// Route only queued work. Both transports use the same durable job ID; the
// Device actor deduplicates delivery, including a late optional Relay receipt.
export async function dispatchQueuedJob(job, {read, persist, routeLocal, enqueueLocal, sendRelay, relayReady}) {
  let current = await read(job.id);
  if (!current || current.status !== 'queued') return current;
  if (current.viaRelay && relayReady) {
    try {
      const messageId = await sendRelay(current);
      current = await read(job.id);
      if (current) await persist({...current, requestMessageId: messageId});
      return current;
    } catch {
      current = await read(job.id);
      if (!current || current.status !== 'queued') return current;
      current = {...current, routingReason: 'Optional Relay delivery unavailable; queued locally.'};
    }
  } else if (current.viaRelay) {
    current = {...current, routingReason: 'Relay is disabled or unavailable; recovered in the local durable queue.'};
  }
  if (current.viaRelay) current = await routeLocal(current);
  if (!current || current.status !== 'queued') return current;
  await enqueueLocal(JSON.stringify(current));
  return current;
}
