import { writeFileSync, mkdirSync, existsSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');
const TMP_DIR = join(__dirname, '..', '.tmp-ndc');
const ZIP_URL = 'https://www.accessdata.fda.gov/cder/ndctext.zip';
const OUTPUT_FILE = join(DATA_DIR, 'ndc.json');

const download = async () => {
  console.log('Downloading NDC directory from FDA...');
  if (existsSync(TMP_DIR)) { rmSync(TMP_DIR, { recursive: true }); }
  mkdirSync(TMP_DIR, { recursive: true });

  const zipPath = join(TMP_DIR, 'ndctext.zip');
  const res = await fetch(ZIP_URL);
  if (!res.ok) { throw new Error(`Download failed: ${res.status}`); }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(zipPath, buffer);
  console.log(`Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

  execSync(`unzip -o "${zipPath}" -d "${TMP_DIR}"`, { stdio: 'pipe' });
  console.log('Extracted zip');
};

const parseProducts = () => {
  const files = readdirSync(TMP_DIR);
  const productFile = files.find((f) => f.toLowerCase() === 'product.txt');
  if (!productFile) { throw new Error('product.txt not found in zip'); }

  const raw = readFileSync(join(TMP_DIR, productFile), 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const headers = lines[0].split('\t').map((h) => h.trim());

  const col = (name) => headers.indexOf(name);

  const products = lines.slice(1).reduce((acc, line) => {
    const fields = line.split('\t');
    const ndc = (fields[col('PRODUCTNDC')] || '').trim();
    if (!ndc) { return acc; }

    acc.push({
      ndc,
      ndcNormalized: ndc.replace(/-/g, ''),
      name: (fields[col('PROPRIETARYNAME')] || '').trim(),
      genericName: (fields[col('NONPROPRIETARYNAME')] || '').trim(),
      dosageForm: (fields[col('DOSAGEFORMNAME')] || '').trim(),
      route: (fields[col('ROUTENAME')] || '').trim(),
      ingredients: (fields[col('SUBSTANCENAME')] || '').trim(),
      strength: [
        (fields[col('ACTIVE_NUMERATOR_STRENGTH')] || '').trim(),
        (fields[col('ACTIVE_INGRED_UNIT')] || '').trim(),
      ].filter(Boolean).join(' '),
      pharmClasses: (fields[col('PHARM_CLASSES')] || '').trim(),
      deaSchedule: (fields[col('DEASCHEDULE')] || '').trim() || null,
      manufacturer: (fields[col('LABELERNAME')] || '').trim(),
      productType: (fields[col('PRODUCTTYPENAME')] || '').trim(),
      marketingStatus: (fields[col('MARKETINGCATEGORYNAME')] || '').trim(),
    });

    return acc;
  }, []);

  return products;
};

const run = async () => {
  try {
    await download();
    const products = parseProducts();
    console.log(`Parsed ${products.length} products`);

    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(products));
    console.log(`Wrote ${OUTPUT_FILE}`);

    const meta = {
      source: ZIP_URL,
      builtAt: new Date().toISOString(),
      recordCount: products.length,
    };
    writeFileSync(join(DATA_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
    console.log('Wrote meta.json');

    rmSync(TMP_DIR, { recursive: true });
    console.log('Cleaned up temp files');
  } catch (err) {
    console.error('Build failed:', err.message);
    process.exit(1);
  }
};

run();
