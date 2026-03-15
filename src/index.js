import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3012;
const MAX_BATCH = 50;
const MAX_RESULTS = 100;
const NDC_REGEX = /^[\d-]+$/;

app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  });
  next();
});

const raw = readFileSync(join(__dirname, 'data', 'ndc.json'), 'utf-8');
const products = JSON.parse(raw);

const ndcMap = new Map();
products.forEach((p) => {
  ndcMap.set(p.ndcNormalized, p);
  ndcMap.set(p.ndc, p);
});

const normalize = (ndc) => ndc.replace(/[-\s]/g, '');

const formatProduct = ({ ndcNormalized, ...rest }) => rest;

const searchProducts = (query, limit) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) { return []; }

  const scored = products.reduce((acc, p) => {
    const searchable = `${p.name} ${p.genericName} ${p.ingredients} ${p.manufacturer}`.toLowerCase();
    let score = 0;

    terms.forEach((term) => {
      if (searchable.includes(term)) { score += 1; }
    });

    if (score > 0) {
      const nameMatch = p.name.toLowerCase().startsWith(terms[0]) || p.genericName.toLowerCase().startsWith(terms[0]);
      if (nameMatch) { score += 2; }
      acc.push({ product: p, score });
    }

    return acc;
  }, []);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => formatProduct(s.product));
};

app.get('/', (_req, res) => {
  res.json({
    name: 'NDC Drug Lookup API',
    version: '1.0.0',
    description: 'Search the FDA National Drug Code directory',
    totalProducts: products.length,
    endpoints: {
      'GET /lookup?ndc=0002-1433-80': 'Look up a drug by NDC code',
      'GET /search?q=metformin&limit=25': 'Search by drug name',
      'GET /search?ingredient=acetaminophen': 'Search by active ingredient',
      'GET /search?manufacturer=pfizer': 'Search by manufacturer',
      'GET /schedule/:schedule': 'List drugs by DEA schedule (CII, CIII, CIV, CV)',
      'POST /lookup/batch': 'Batch lookup (body: { ndcs: [...] }, max 50)',
      'GET /health': 'Health check',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', products: products.length, timestamp: new Date().toISOString() });
});

const metaPath = join(__dirname, 'data', 'meta.json');
const dataMeta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : null;

app.get('/data-info', (_req, res) => {
  res.json({
    source: 'FDA NDC Directory',
    url: 'https://www.accessdata.fda.gov/cder/ndctext.zip',
    recordCount: products.length,
    builtAt: dataMeta?.builtAt || 'unknown',
    updateFrequency: 'weekly',
  });
});

app.get('/lookup', (req, res) => {
  const { ndc } = req.query;

  if (!ndc || typeof ndc !== 'string') {
    return res.status(400).json({ error: 'Missing required query parameter: ndc' });
  }

  if (!NDC_REGEX.test(ndc)) {
    return res.status(400).json({ error: 'Invalid NDC format' });
  }

  const normalized = normalize(ndc);
  const product = ndcMap.get(normalized) || ndcMap.get(ndc);

  if (!product) {
    return res.status(404).json({ error: 'NDC not found', ndc });
  }

  res.json(formatProduct(product));
});

app.get('/search', (req, res) => {
  const { q, ingredient, manufacturer, limit: limitStr } = req.query;
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 25, 1), MAX_RESULTS);

  if (q) {
    if (typeof q !== 'string' || q.length > 200) {
      return res.status(400).json({ error: 'Invalid search query' });
    }
    const results = searchProducts(q, limit);
    return res.json({ query: q, count: results.length, results });
  }

  if (ingredient) {
    if (typeof ingredient !== 'string' || ingredient.length > 200) {
      return res.status(400).json({ error: 'Invalid ingredient query' });
    }
    const term = ingredient.toLowerCase();
    const results = products
      .filter((p) => p.ingredients.toLowerCase().includes(term))
      .slice(0, limit)
      .map(formatProduct);
    return res.json({ ingredient, count: results.length, results });
  }

  if (manufacturer) {
    if (typeof manufacturer !== 'string' || manufacturer.length > 200) {
      return res.status(400).json({ error: 'Invalid manufacturer query' });
    }
    const term = manufacturer.toLowerCase();
    const results = products
      .filter((p) => p.manufacturer.toLowerCase().includes(term))
      .slice(0, limit)
      .map(formatProduct);
    return res.json({ manufacturer, count: results.length, results });
  }

  res.status(400).json({ error: 'Provide at least one search parameter: q, ingredient, or manufacturer' });
});

app.get('/schedule/:schedule', (req, res) => {
  const { schedule } = req.params;
  const { limit: limitStr } = req.query;
  const limit = Math.min(Math.max(parseInt(limitStr, 10) || 25, 1), MAX_RESULTS);

  const validSchedules = ['CI', 'CII', 'CIII', 'CIV', 'CV'];
  const normalized = schedule.toUpperCase();

  if (!validSchedules.includes(normalized)) {
    return res.status(400).json({ error: `Invalid schedule. Must be one of: ${validSchedules.join(', ')}` });
  }

  const results = products
    .filter((p) => p.deaSchedule === normalized)
    .slice(0, limit)
    .map(formatProduct);

  res.json({ schedule: normalized, count: results.length, results });
});

app.post('/lookup/batch', (req, res) => {
  const { ndcs } = req.body;

  if (!ndcs || !Array.isArray(ndcs)) {
    return res.status(400).json({ error: 'Request body must contain an "ndcs" array' });
  }

  if (ndcs.length > MAX_BATCH) {
    return res.status(400).json({ error: `Maximum ${MAX_BATCH} NDCs per batch request` });
  }

  const results = ndcs.map((ndc) => {
    if (!ndc || typeof ndc !== 'string' || !NDC_REGEX.test(ndc)) {
      return { ndc, error: 'Invalid NDC format' };
    }

    const normalized = normalize(ndc);
    const product = ndcMap.get(normalized) || ndcMap.get(ndc);

    return product ? formatProduct(product) : { ndc, error: 'Not found' };
  });

  res.json({ total: results.length, results });
});

app.listen(PORT, () => {
  console.log(`NDC Drug Lookup API running on port ${PORT} (${products.length} products loaded)`);
});
