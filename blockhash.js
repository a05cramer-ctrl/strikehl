import { rpc, send } from './_lib.js';

export default async function handler(req, res) {
  try {
    const r = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    send(res, 200, r.value, 0);
  } catch (e) { send(res, 502, { error: String(e.message || e) }, 0); }
}
