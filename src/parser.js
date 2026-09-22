import path from 'node:path';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import { terms, unique } from './utils.js';

function lineOf(text, offset) { return text.slice(0, offset).split('\n').length; }
function matches(text, regex, mapper) { const out = []; let m; while ((m = regex.exec(text))) out.push(mapper(m)); return out; }
const languageFor = { JavaScript, TypeScript: TypeScript.typescript, Python };
function walk(node, visit) { visit(node); for (let i = 0; i < node.namedChildCount; i++) walk(node.namedChild(i), visit); }
function astParse(file) {
  const language = languageFor[file.language]; if (!language) return null;
  const parser = new Parser(); let tree;
  try { parser.setLanguage(language); tree = parser.parse(file.content); }
  catch { return null; }
  const symbols = []; const imports = []; const calls = [];
  const addSymbol = (node, kind) => { const name = node.childForFieldName('name'); if (name) symbols.push({ name: name.text, kind, line: node.startPosition.row + 1 }); };
  walk(tree.rootNode, (node) => {
    if (file.language === 'Python') {
      if (node.type === 'class_definition') addSymbol(node, 'class');
      if (node.type === 'function_definition') addSymbol(node, 'function');
      if (node.type === 'import_statement' || node.type === 'import_from_statement') imports.push(...node.text.replace(/^from\s+|^import\s+|\s+import\s+/g, ' ').split(/[ ,]+/).filter((value) => value && !value.includes('*')));
    } else {
      if (node.type === 'function_declaration' || node.type === 'generator_function_declaration') addSymbol(node, 'function');
      if (node.type === 'class_declaration' || node.type === 'interface_declaration') addSymbol(node, 'class');
      if (node.type === 'type_alias_declaration') addSymbol(node, 'type');
      if (node.type === 'variable_declarator') { const name = node.childForFieldName('name'); if (name?.type === 'identifier') symbols.push({ name: name.text, kind: 'symbol', line: node.startPosition.row + 1 }); }
      if (node.type === 'import_statement') { const source = node.childForFieldName('source'); if (source) imports.push(source.text.replace(/^['\"]|['\"]$/g, '')); }
    }
    if (node.type === 'call_expression' || node.type === 'call') { const fn = node.childForFieldName('function'); if (fn?.type === 'identifier') calls.push(fn.text); }
  });
  return { symbols: unique(symbols.map((symbol) => `${symbol.kind}\0${symbol.name}\0${symbol.line}`)).map((value) => { const [kind, name, line] = value.split('\0'); return { kind, name, line: Number(line) }; }), imports: unique(imports), calls: unique(calls), parser: 'tree-sitter' };
}
export function parseFile(file) {
  const { path: filePath, content, language } = file;
  const parsedAst = astParse(file); const symbols = parsedAst?.symbols || []; const imports = parsedAst?.imports || []; const calls = parsedAst?.calls || []; const endpoints = []; const test = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[^.]+$/i.test(filePath);
  if (!parsedAst && (language === 'TypeScript' || language === 'JavaScript')) {
    symbols.push(...matches(content, /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const)\s+([A-Za-z_$][\w$]*)/g, (m) => ({ name: m[1], kind: /class|interface/.test(m[0]) ? 'class' : 'symbol', line: lineOf(content, m.index) })));
    imports.push(...matches(content, /(?:import[\s\S]*?from\s*|require\s*\()\s*['\"]([^'\"]+)['\"]/g, (m) => m[1]));
  } else if (!parsedAst && language === 'Python') {
    symbols.push(...matches(content, /^\s*(?:async\s+def|def|class)\s+([A-Za-z_]\w*)/gm, (m) => ({ name: m[1], kind: m[0].includes('class') ? 'class' : 'function', line: lineOf(content, m.index) })));
    imports.push(...matches(content, /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm, (m) => m[1] || m[2]));
  }
  if (language === 'TypeScript' || language === 'JavaScript') endpoints.push(...matches(content, /\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)/g, (m) => ({ method: m[1].toUpperCase(), path: m[2] })));
  if (language === 'Python') endpoints.push(...matches(content, /@\w+\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)/g, (m) => ({ method: m[1].toUpperCase(), path: m[2] })));
  if (language === 'Markdown') symbols.push(...matches(content, /^(#{1,6})\s+(.+)$/gm, (m) => ({ name: m[2].trim(), kind: 'section', line: lineOf(content, m.index) })));
  const basenameTerms = terms(path.basename(filePath, path.extname(filePath)));
  return { symbols, imports: unique(imports), calls: unique(calls), endpoints, test, parser: parsedAst?.parser || 'regex', keywords: unique([...basenameTerms, ...symbols.flatMap((s) => terms(s.name))]) };
}
