import { hl, cached, send, isCoin } from './_lib.js';

// 1-minute candles for the last 2 hours from Hyperliquid, oldest first: [t, o, h, l, c].
export default async function handler(req, res) {
  const coin = req.query.coin;
  if (!isCoin(coin)) return send(res, 400, { error: 'coin' });
  try {
    const list = await cached('c:' + coin, 20000, async () => {
      const end = Date.now(), start = end - 150 * 60e3;
      const rows = await hl({ type: 'candleSnapshot', req: { coin, interval: '1m', startTime: start, endTime: end } });
      return rows.map(r => [Math.floor(r.t / 1000), +r.o, +r.h, +r.l, +r.c]);
    });
    send(res, 200, { candles: list, at: Date.now() }, 15);
  } catch (e) { send(res, 502, { error: String(e.message || e), candles: [] }, 5); }
}
