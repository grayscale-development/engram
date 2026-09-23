import fs from 'node:fs/promises';
import { automaticEvidenceSummary } from './evidence.js';
import { verifyCortexHistory, readCortexSnapshot } from './service.js';
import { shadowStatus } from './shadow.js';

export async function createReportBundle(root, output) {
  const [snapshot, evidence, history, shadow] = await Promise.all([
    readCortexSnapshot(root),
    automaticEvidenceSummary(root),
    verifyCortexHistory(root),
    shadowStatus(root)
  ]);
  const bundle = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    scope: 'Engram shareable repository-context bundle',
    repository: snapshot.cortex.repository,
    cortex: { revision: snapshot.revision, chart: snapshot.cortex.chart },
    history,
    automatic_evidence: evidence,
    shadow_learning: shadow,
    limitations: [
      'This bundle does not include raw automatic-evidence events, task prompts, source snippets, or model output.',
      'Automatic evidence is local activity and Cortex-context sizing, not measured task success, total model tokens, cost, or latency.',
      'Cortex content is agent-authored navigation data and must be verified against its cited repository evidence.'
    ]
  };
  await fs.writeFile(output, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  return { output, revision: snapshot.revision };
}
