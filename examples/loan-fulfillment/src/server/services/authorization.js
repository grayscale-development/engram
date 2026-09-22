export function authorizeTaskAccess(taskId, user) { if (!user.taskIds.includes(taskId)) throw new Error('forbidden'); }
