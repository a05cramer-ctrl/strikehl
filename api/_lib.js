export const HL = 'https://api.hyperliquid.xyz/info';
export const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const RULES = { PAYOUT_X: 1.8, MIN_VOL_USD: 1000000, MAX_STAKE_SOL: 0.5, MAX_STAKE_POOL_PCT: 2, MIN_STAKE_SOL: 0.01, MAX_COIN_OI_PCT: 10, EXPIRY_S: 3600 };
export const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || ''));
export const isCoin = s => /^[A-Za-z0-9]{1,16}$/.test(String(s || ''));
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
export const icon = n => `https://app.hyperliquid.xyz/coins/${n}.svg`;

export async function hl(body) {
  const r = await fetch(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('hyperliquid ' + r.status);
  return r.json();
}

// All Hyperliquid perps with 24h stats, biggest volume first.
export async function markets() {
  const [meta, ctxs] = await hl({ type: 'metaAndAssetCtxs' });
  return meta.universe.map((u, i) => {
    const c = ctxs[i] || {}; const px = num(c.midPx) ?? num(c.markPx), prev = num(c.prevDayPx);
    return { coin: u.name, delisted: !!u.isDelisted, maxLev: u.maxLeverage, price: px, chg24: px && prev ? (px / prev - 1) * 100 : null,
      vol24: num(c.dayNtlVlm), oi: num(c.openInterest) != null && num(c.markPx) ? num(c.openInterest) * num(c.markPx) : null, funding: num(c.funding), image: icon(u.name) };
  }).filter(m => !m.delisted && m.price).sort((a, b) => (b.vol24 || 0) - (a.vol24 || 0));
}

const cache = new Map();
export async function cached(key, ms, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ms) return c.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return v;
}

export async function getJSON(url, init) {
  const r = await fetch(url, { ...init, headers: { accept: 'application/json', ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(new URL(url).host + ' ' + r.status);
  return r.json();
}

export function send(res, code, body, maxAge = 5) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 3}`);
  res.status(code).json(body);
}

export const rpcUrl = () => process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com';

export async function rpc(method, params) {
  const j = await getJSON(rpcUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (j.error) throw new Error(j.error.message || 'rpc');
  return j.result;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  const bytes = [0];
  for (const ch of s) {
    let v = B58.indexOf(ch); if (v < 0) throw new Error('b58');
    for (let i = 0; i < bytes.length; i++) { v += bytes[i] * 58; bytes[i] = v & 255; v >>= 8; }
    while (v) { bytes.push(v & 255); v >>= 8; }
  }
  for (const ch of s) { if (ch === '1') bytes.push(0); else break; }
  return Uint8Array.from(bytes.reverse());
}
