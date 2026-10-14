import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

// Load static fallback catalog
let catalogData: any = null;
try {
  const dataPath = path.resolve(__dirname, 'src/data/coursesData.json');
  if (fs.existsSync(dataPath)) {
    catalogData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    console.log(`[GB STUDY] Loaded offline catalog with ${catalogData.batches?.length || 0} batches and ${Object.keys(catalogData.master_items || {}).length} topic collections.`);
  }
} catch (e) {
  console.error('[GB STUDY] Error loading local catalog:', e);
}

// Endpoint to get all cached data at once for ultra-fast instant hydration
app.get('/api/catalog', (_req, res) => {
  if (catalogData) {
    return res.json({ success: true, data: catalogData });
  }
  return res.status(503).json({ success: false, message: 'Catalog data initializing' });
});

// Proxy handler with upstream forwarding + graceful local fallback
app.post('/api/ms/*', async (req, res) => {
  const subPath = req.url.replace('/api/ms', '');
  const upstreamUrl = `https://mastersahab.studybeepro.site/api/ms${subPath}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify(req.body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (upstreamRes.ok) {
      const data = await upstreamRes.json();
      return res.json(data);
    }
  } catch (err) {
    console.log(`[GB STUDY Proxy] Upstream bypass/timeout for ${subPath}, using internal cache.`);
  }

  // Graceful fallback from local catalogData
  if (catalogData) {
    if (subPath.includes('get_courses')) {
      return res.json({
        success: true,
        decoded: true,
        decodedResponse: { status: true, message: 'Course Found.', data: catalogData.courses }
      });
    }

    if (subPath.includes('get_combo_course_list')) {
      return res.json({
        success: true,
        decoded: true,
        decodedResponse: { status: true, message: 'Course Found.', data: catalogData.batches }
      });
    }

    if (subPath.includes('get_course_detail')) {
      const courseId = String(req.body?.course_id || '');
      const detail = catalogData.batch_details?.[courseId];
      if (detail) {
        return res.json({
          success: true,
          decoded: true,
          decodedResponse: { status: true, message: 'Course Found.', data: detail }
        });
      }
    }

    if (subPath.includes('get_master_data')) {
      const { course_id, subject_id, topic_id } = req.body || {};
      const key = `${course_id}_${subject_id}_${topic_id}`;
      const items = catalogData.master_items?.[key] || [];
      return res.json({
        success: true,
        decoded: true,
        decodedResponse: {
          status: true,
          message: 'Data Found.',
          data: { list: items }
        }
      });
    }
  }

  return res.status(502).json({ success: false, message: 'Upstream service unavailable' });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GB STUDY] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
