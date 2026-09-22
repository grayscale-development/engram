import path from 'node:path';
import { terms, unique } from './utils.js';

function lineOf(text, offset) { return text.slice(0, offset).split('\n').length; }
function matches(text, regex, mapper) { const out = []; let m; while ((m = regex.exec(text))) out.push(mapper(m)); return out; }
export function parseFile(file) {
  const { path: filePath, content, language } = file;
  const symbols = []; const imports = []; const endpoints = []; const test = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[^.]+$/i.test(filePath);
  if (language === 'TypeScript' || language === 'JavaScript') {
    symbols.push(...matches(content, /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/g, (m) => ({ name: m[1], kind: /class|interface/.test(m[0]) ? 'class' : 'symbol', line: lineOf(content, m.index) })));
    imports.push(...matches(content, /(?:import[\s\S]*?from\s*|require\s*\()\s*['\"]([^'\"]+)['\"]/g, (m) => m[1]));
    endpoints.push(...matches(content, /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)/g, (m) => ({ method: m[1].toUpperCase(), path: m[2] })));
  } else if (language === 'Python') {
    symbols.push(...matches(content, /^\s*(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/gm, (m) => ({ name: m[1], kind: m[0].includes('class') ? 'class' : 'function', line: lineOf(content, m.index) })));
    imports.push(...matches(content, /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm, (m) => m[1] || m[2]));
    endpoints.push(...matches(content, /@\w+\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)/g, (m) => ({ method: m[1].toUpperCase(), path: m[2] })));
  }
  const basenameTerms = terms(path.basename(filePath, path.extname(filePath)));
  return { symbols, imports: unique(imports), endpoints, test, keywords: unique([...basenameTerms, ...symbols.flatMap((s) => terms(s.name))]) };
}
