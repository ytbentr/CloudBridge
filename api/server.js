import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));
const PORT = Number(process.env.PORT || 10000);
const DATA_DIR = process.env.DATA_DIR || '/var/data';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const STORE = path.join(DATA_DIR, 'files');
const CATALOG = path.join(DATA_DIR, 'catalog.json');
const FEATURES = path.join(DATA_DIR, 'features.json');
fs.mkdirSync(path.join(STORE, 'plugins'), { recursive: true });
fs.mkdirSync(path.join(STORE, 'worlds'), { recursive: true });
if (!fs.existsSync(CATALOG)) fs.writeFileSync(CATALOG, JSON.stringify({ plugins: [], worlds: [] }, null, 2));
if (!fs.existsSync(FEATURES)) fs.writeFileSync(FEATURES, JSON.stringify({
  joinMessage: { enabled: true, message: '&aWelcome to the server, {player}!' },
  joinBroadcast: { enabled: false, message: '&e{player} joined the server.' },
  welcomeTitle: { enabled: false, title: '&bWelcome!', subtitle: '&7Enjoy your stay, {player}.' },
  serverListMotd: { enabled: true, message: '&bCloudBridge Server\n&7Features managed from Render cloud' },
  updatedAt: new Date().toISOString()
}, null, 2));
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { const tmp = file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); }
function readCatalog() { return readJson(CATALOG, { plugins: [], worlds: [] }); }
function readFeatures() { return readJson(FEATURES, {}); }
function constantTimeEqual(a, b) { const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b)); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); }
function admin(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'Render Environment bölümünde ADMIN_TOKEN ayarlanmamış.' });
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!constantTimeEqual(token, ADMIN_TOKEN)) return res.status(401).json({ error: 'Yönetici anahtarı yanlış.' });
  next();
}
function bridge(req, res, next) {
  if (!BRIDGE_TOKEN) return res.status(503).json({ error: 'Render Environment bölümünde BRIDGE_TOKEN ayarlanmamış.' });
  if (!constantTimeEqual(req.get('x-bridge-token') || '', BRIDGE_TOKEN)) return res.status(401).json({ error: 'CloudBridge kimlik doğrulaması başarısız.' });
  next();
}
function cleanName(raw) {
  const name = path.basename(String(raw || '')).replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  if (!name || name.startsWith('.') || name.length > 120 || name === '.' || name === '..') throw new Error('Geçersiz dosya adı.');
  return name;
}
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(STORE, req.params.type === 'plugins' ? 'plugins' : 'worlds')),
    filename: (req, file, cb) => { try { cb(null, cleanName(file.originalname)); } catch (e) { cb(e); } }
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const type = req.params.type;
    const ok = type === 'plugins' ? file.originalname.toLowerCase().endsWith('.jar') : type === 'worlds' ? file.originalname.toLowerCase().endsWith('.zip') : false;
    cb(ok ? null : new Error('Eklenti için .jar, dünya arşivi için .zip yükleyin.'), ok);
  }
});
app.use(express.static(path.join(here, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'CloudBridge API' }));
app.get('/api/files', (req, res) => {
  const c = readCatalog();
  if (req.query.type && !['plugins', 'worlds'].includes(req.query.type)) return res.status(400).json({ error: 'type plugins veya worlds olmalı.' });
  res.json(req.query.type ? { [req.query.type]: c[req.query.type] } : c);
});
// Only the authenticated CloudBridge server can download cataloged files for installation.
app.get('/api/files/:type/:name', bridge, (req, res) => {
  if (!['plugins', 'worlds'].includes(req.params.type)) return res.status(400).json({ error: 'Geçersiz tür.' });
  let name; try { name = cleanName(req.params.name); } catch { return res.status(400).json({ error: 'Geçersiz dosya adı.' }); }
  const item = readCatalog()[req.params.type].find(x => x.name === name);
  if (!item) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  const file = path.join(STORE, req.params.type, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Dosya diskte bulunamadı.' });
  res.download(file, name);
});
app.post('/api/upload/:type', admin, (req, res) => {
  if (!['plugins', 'worlds'].includes(req.params.type)) return res.status(400).json({ error: 'type plugins veya worlds olmalı.' });
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message || 'Yükleme başarısız.' });
    if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
    const c = readCatalog();
    const item = { name: req.file.filename, size: req.file.size, uploadedAt: new Date().toISOString() };
    const i = c[req.params.type].findIndex(x => x.name === item.name);
    if (i >= 0) c[req.params.type][i] = item; else c[req.params.type].push(item);
    c[req.params.type].sort((a, b) => a.name.localeCompare(b.name)); writeJson(CATALOG, c);
    res.json({ ok: true, file: item, note: 'Dosya bulutta saklandı. Sunucuya indirmek için oyunda /cloud install <dosya.jar> kullanın; sonra sunucuyu yeniden başlatın.' });
  });
});
app.delete('/api/files/:type/:name', admin, (req, res) => {
  if (!['plugins', 'worlds'].includes(req.params.type)) return res.status(400).json({ error: 'Geçersiz tür.' });
  let name; try { name = cleanName(req.params.name); } catch { return res.status(400).json({ error: 'Geçersiz dosya adı.' }); }
  const c = readCatalog(); const i = c[req.params.type].findIndex(x => x.name === name);
  if (i < 0) return res.status(404).json({ error: 'Dosya bulunamadı.' });
  const file = path.join(STORE, req.params.type, name); if (fs.existsSync(file)) fs.unlinkSync(file);
  c[req.params.type].splice(i, 1); writeJson(CATALOG, c); res.json({ ok: true });
});
app.get('/api/admin/features', admin, (_req, res) => res.json(readFeatures()));
app.put('/api/admin/features', admin, (req, res) => {
  const input = req.body || {};
  const allowed = ['joinMessage', 'joinBroadcast', 'welcomeTitle', 'serverListMotd'];
  const current = readFeatures();
  for (const key of allowed) {
    if (!input[key] || typeof input[key] !== 'object') continue;
    const old = current[key] || {};
    const item = { enabled: input[key].enabled === true };
    for (const field of (key === 'welcomeTitle' ? ['title', 'subtitle'] : ['message'])) {
      if (typeof input[key][field] === 'string') item[field] = input[key][field].slice(0, 240);
      else if (typeof old[field] === 'string') item[field] = old[field];
    }
    current[key] = item;
  }
  current.updatedAt = new Date().toISOString();
  writeJson(FEATURES, current); res.json({ ok: true, features: current });
});
app.get('/api/bridge/config', bridge, (_req, res) => res.json({ features: readFeatures(), serverTime: new Date().toISOString() }));
app.use((err, _req, res, _next) => { console.error(err); if (!res.headersSent) res.status(500).json({ error: 'Sunucu hatası.' }); });
app.listen(PORT, '0.0.0.0', () => console.log(`CloudBridge API listening on ${PORT}; data=${DATA_DIR}`));
