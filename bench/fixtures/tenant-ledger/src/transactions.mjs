export function updateTransaction({ actorTenantId, transactionId, body, store }) {
  if (!actorTenantId || actorTenantId !== body.tenantId) throw new Error('forbidden');
  const current = store.get(transactionId);
  if (!current) throw new Error('not found');
  Object.assign(current, body);
  return current;
}
