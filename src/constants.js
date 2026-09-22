export const FORMAT_VERSION = 3;
export const GENERATOR_VERSION = '1.0.2';
export const GRAPH_PATH = '.ai/graph';
export const DEFAULT_IGNORES = new Set([
  '.git', '.ai', 'node_modules', 'dist', 'build', 'coverage', '.next', 'vendor', 'bin', 'obj',
  '__pycache__', '.venv', 'venv', '.DS_Store'
]);
export const SENSITIVE_NAMES = /(^|\/)(\.env(?:\..*)?|.*\.(pem|key|p12)|id_rsa|credentials(?:\.json)?)$/i;
export const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.json', '.md', '.yml', '.yaml', '.toml', '.html', '.css', '.sql', '.sh']);
export const LANGUAGE_BY_EXTENSION = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.py': 'Python', '.json': 'JSON',
  '.md': 'Markdown', '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML', '.css': 'CSS', '.html': 'HTML', '.sql': 'SQL', '.sh': 'Shell'
};
