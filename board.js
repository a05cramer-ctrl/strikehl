import { RULES, cached, send, markets } from './_lib.js';

// Hyperliquid perps you can buy a STRIKE option on right now: 24h volume over the floor.
export default async function handler(req, res) {
  try {
    const data = await cached('board', 10000, async () => {
      const all = await markets();
      return { coins: all.filter(m => (m.vol24 || 0) >= RULES.MIN_VOL_USD).slice(0, 40), scanned: all.length };
    });
    send(res, 200, { ...data, rules: RULES, at: Date.now() }, 8);
  } catch (e) { send(res, 502, { error: String(e.message || e) }, 2); }
}
