import { FORMAT_VERSION } from './constants.js';
import { readCortexSnapshot } from './service.js';

export async function migrationReport(root) {
  const snapshot = await readCortexSnapshot(root);
  const stored = snapshot.cortex.format_version;
  return {
    status: stored === FORMAT_VERSION ? 'no_migration_needed' : 'migration_required',
    repository: snapshot.cortex.repository,
    cortex_revision: snapshot.revision,
    stored_format_version: stored,
    supported_format_version: FORMAT_VERSION,
    safe_action: stored === FORMAT_VERSION
      ? 'No Cortex migration is required. Run init to refresh the local runtime and installed skills without replacing the Cortex.'
      : 'Do not modify the Cortex automatically. Install a package version that documents this format migration, then follow its revision-safe migration procedure.'
  };
}
