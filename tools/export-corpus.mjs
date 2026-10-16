// Export Corpus: Generates machine-readable JSON and CSV datasets of all 765 evidence-based rules.
// Outputs:
//   - the-evidence-based-life.json (Root & dist/ for direct HTTP API and programmatic usage)
//   - the-evidence-based-life.csv  (Root & dist/ for spreadsheet analysis, Notion, and databases)
//
// Usage:
//   node tools/export-corpus.mjs
//   node tools/export-corpus.mjs --check
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const W = {
  money: { '0': 0, 'Low': 1, 'High': 2 },
  time: { 'Low': 0, 'Med': 1, 'High': 2 },
  will: { 'No': 0, 'Some': 1, 'Yes': 2 },
};

function ratioOf(cost, level) {
  if (level === 'High') return cost === 0 ? 'Very High' : cost <= 2 ? 'High' : 'Moderate';
  return level === 'Med' && cost === 0 ? 'High' : 'Moderate';
}

function cleanMd(s) {
  if (!s) return '';
  return s.replace(/\*\*/g, '').replace(/\\([*_])/g, '$1').trim();
}

function csvCell(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return '"' + str.replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
}

const bookFiles = readdirSync(join(ROOT, 'book')).filter(f => f.endsWith('.md')).sort();
const chapters = [];
const allRules = [];

for (const file of bookFiles) {
  const content = readFileSync(join(ROOT, 'book', file), 'utf8');
  const lines = content.split(/\r?\n/);
  let curChapter = null;
  let curRule = null;

  const flushRule = () => {
    if (curRule && curChapter) {
      const m = W.money[curRule.money] ?? 0;
      const t = W.time[curRule.time] ?? 0;
      const w = W.will[curRule.will] ?? 0;
      curRule.roi = ratioOf(m + t + w, curRule.benefitLevel);
      curChapter.rules.push(curRule);
      allRules.push(curRule);
    }
    curRule = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^#{1,2}\s+(\d+)\.\s+(.+)$/.exec(line))) {
      flushRule();
      curChapter = { sec: parseInt(m[1], 10), title: cleanMd(m[2]), rules: [] };
      chapters.push(curChapter);
      continue;
    }
    if ((m = /^###\s+(\d+)\.\s+(.+)$/.exec(line))) {
      flushRule();
      const n = parseInt(m[1], 10);
      curRule = {
        id: `e-${curChapter.sec}-${n}`,
        chapter: curChapter.sec,
        chapterTitle: curChapter.title,
        n,
        title: cleanMd(m[2]),
        grade: '',
        roi: '',
        benefitLevel: '',
        money: '',
        time: '',
        will: '',
        metric: '',
        cost: '',
        gain: '',
        plainTerms: '',
        note: '',
        disputed: false,
        todo: false,
        sources: [],
        sourcesRaw: '',
        url: `https://parveen0029.github.io/The-Evidence-Based-Life/#e-${curChapter.sec}-${n}`
      };
      continue;
    }
    if ((m = /^\x3c!--\s*Cost Tag:\s*(.*?)\s*-->/i.exec(line)) && curRule) {
      for (const kv of m[1].split(/\s+/)) {
        const [k, v] = kv.split('=');
        if (k === 'Money') curRule.money = v;
        if (k === 'Time') curRule.time = v;
        if (k === 'Willpower') curRule.will = v;
        if (k === 'Benefit') curRule.benefitLevel = v;
        if (k === 'Metric') curRule.metric = v;
      }
      continue;
    }
    if (curRule) {
      if ((m = /^- Cost:\s*(.*)$/i.exec(line))) curRule.cost = cleanMd(m[1]);
      else if ((m = /^- In plain terms:\s*(.*)$/i.exec(line))) curRule.plainTerms = cleanMd(m[1]);
      else if ((m = /^- Benefit:\s*(.*)$/i.exec(line))) curRule.gain = cleanMd(m[1]);
      else if ((m = /^- Evidence grade:\s*([ABC])/i.exec(line))) curRule.grade = m[1].toUpperCase();
      else if ((m = /^- Sources:\s*(.*)$/i.exec(line))) {
        curRule.sourcesRaw = cleanMd(m[1]);
        curRule.sources = [...new Set(Array.from(m[1].matchAll(/https?:\/\/[^\s)<>"]+/g), match => match[0]))];
      } else if ((m = /^- Notes:\s*(.*)$/i.exec(line))) {
        curRule.note = cleanMd(m[1]);
        curRule.disputed = /dispute|controvers/i.test(curRule.note);
        curRule.todo = /TODO|to be verified|under verification/i.test(curRule.note);
      }
    }
  }
  flushRule();
}

const dataset = {
  title: 'The Evidence-Based Life',
  subtitle: 'A prioritized compendium of verified life habits ranked by return-on-investment across peer-reviewed literature',
  license: 'CC-BY-4.0',
  homepage: 'https://parveen0029.github.io/The-Evidence-Based-Life/',
  repository: 'https://github.com/parveen0029/The-Evidence-Based-Life',
  rulesCount: allRules.length,
  chaptersCount: chapters.length,
  generated: new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
  rules: allRules
};

const jsonStr = JSON.stringify(dataset, null, 2);

// CSV generation
const csvHeaders = [
  'id',
  'chapter',
  'rule_num',
  'chapter_title',
  'title',
  'grade',
  'roi',
  'benefit_level',
  'money_cost',
  'time_cost',
  'willpower_cost',
  'metric',
  'cost_desc',
  'benefit_desc',
  'plain_terms',
  'notes',
  'sources_count',
  'disputed',
  'url'
];

const csvRows = [csvHeaders.join(',')];
for (const r of allRules) {
  const row = [
    csvCell(r.id),
    csvCell(r.chapter),
    csvCell(r.n),
    csvCell(r.chapterTitle),
    csvCell(r.title),
    csvCell(r.grade),
    csvCell(r.roi),
    csvCell(r.benefitLevel),
    csvCell(r.money),
    csvCell(r.time),
    csvCell(r.will),
    csvCell(r.metric),
    csvCell(r.cost),
    csvCell(r.gain),
    csvCell(r.plainTerms),
    csvCell(r.note),
    csvCell(r.sources.length),
    csvCell(r.disputed ? 'true' : 'false'),
    csvCell(r.url)
  ];
  csvRows.push(row.join(','));
}
const csvStr = csvRows.join('\r\n');

if (CHECK) {
  const existingJson = existsSync(join(ROOT, 'the-evidence-based-life.json')) ? readFileSync(join(ROOT, 'the-evidence-based-life.json'), 'utf8') : '';
  const parsed = existingJson ? JSON.parse(existingJson) : null;
  if (!parsed || parsed.rulesCount !== allRules.length) {
    console.error(`Export check failed: expected ${allRules.length} rules, found ${parsed ? parsed.rulesCount : 0}`);
    process.exit(1);
  }
  console.log(`Corpus export check passed: ${allRules.length} rules in sync.`);
  process.exit(0);
}

// Ensure dist/ exists
const distDir = join(ROOT, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

// Write both root and dist/
writeFileSync(join(ROOT, 'the-evidence-based-life.json'), jsonStr, 'utf8');
writeFileSync(join(distDir, 'the-evidence-based-life.json'), jsonStr, 'utf8');

writeFileSync(join(ROOT, 'the-evidence-based-life.csv'), csvStr, 'utf8');
writeFileSync(join(distDir, 'the-evidence-based-life.csv'), csvStr, 'utf8');

console.log(`Exported ${allRules.length} rules across ${chapters.length} chapters:`);
console.log(`  - the-evidence-based-life.json (${(Buffer.byteLength(jsonStr) / 1024).toFixed(1)} KB)`);
console.log(`  - the-evidence-based-life.csv  (${(Buffer.byteLength(csvStr) / 1024).toFixed(1)} KB)`);
