import { authorizeTaskAccess } from '../src/server/services/authorization.js';

export function authorizationIsBackendEnforced() { return authorizeTaskAccess('task-1', { taskIds: ['task-1'] }); }
