import { hl, cached, send, isCoin } from './_lib.js';

// Live Hyperliquid mid price for one perp — the same source the engine uses for strike and settle.
export default async function handler(req, res) {
  const coin = req.query.coin;
  if (!isCoin(coin)) return send(res, 400, { error: 'coin' });
  try {
    const mids = await cached('mids', 2000, () => hl({ type: 'allMids' }));
    if (mids[coin] == null) return send(res, 404, { error: 'unknown coin' });
    send(res, 200, { coin, price: +mids[coin], at: Date.now() }, 2);
  } catch (e) { send(res, 502, { error: String(e.message || e) }, 2); }
}
