import { MEMO, RULES, cached, getJSON, send, isAddr, rpc, b58decode } from './_lib.js';

// The pool's order book, read straight from its on-chain memos (see SPEC: CALL/PUT, OPEN, WIN, LOSE, REFUND).
const dec = new TextDecoder();
function memosOf(tx) {
  const out = [];
  const walk = ins => { for (const i of ins || []) { if (i.programId === MEMO && i.data) { try { out.push(dec.decode(b58decode(i.data))); } catch {} } walk(i.innerInstructions); } };
  walk(tx.instructions);
  return out.filter(m => m.startsWith('STRIKE|'));
}

async function history(pool) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY not set');
  const txs = []; let before = '';
  for (let p = 0; p < 4; p++) {
    const page = await getJSON(`https://api-mainnet.helius-rpc.com/v0/addresses/${pool}/transactions?api-key=${key}&limit=100${before ? '&before=' + before : ''}`);
    if (!Array.isArray(page) || !page.length) break;
    txs.push(...page); before = page[page.length - 1].signature;
    if (page.length < 100) break;
  }
  return txs;
}

export function buildBook(pool, txs) {
  const bets = new Map(); const opens = new Map(); const results = new Map();
  for (const tx of txs) {
    if (tx.transactionError) continue;
    for (const m of memosOf(tx)) {
      const f = m.split('|');
      if ((f[1] === 'CALL' || f[1] === 'PUT') && f[2]) {
        const tr = (tx.nativeTransfers || []).filter(t => t.toUserAccount === pool && t.fromUserAccount !== pool);
        const lamports = tr.reduce((s, t) => s + (t.amount || 0), 0);
        if (lamports > 0) bets.set(tx.signature, { sig: tx.signature, side: f[1], coin: f[2], stake: lamports / 1e9, buyer: tr[0].fromUserAccount, t: tx.timestamp });
      } else if (f[1] === 'OPEN') opens.set(f[2], { strike: +f[3], expiry: +f[4], t: tx.timestamp, sig: tx.signature });
      else if (f[1] === 'WIN' || f[1] === 'LOSE') results.set(f[2], { kind: f[1], settle: +f[3], t: tx.timestamp, sig: tx.signature, paid: f[1] === 'WIN' ? (tx.nativeTransfers || []).filter(t => t.fromUserAccount === pool).reduce((s, t) => s + t.amount, 0) / 1e9 : 0 });
      else if (f[1] === 'REFUND') results.set(f[2], { kind: 'REFUND', reason: f[3] || '', t: tx.timestamp, sig: tx.signature });
    }
  }
  const open = [], settled = [], pending = [];
  let volume = 0, paid = 0, wins = 0, losses = 0;
  for (const b of bets.values()) {
    const o = opens.get(b.sig), r = results.get(b.sig);
    const row = { ...b, ...(o ? { strike: o.strike, expiry: o.expiry, openSig: o.sig } : {}) };
    if (r) {
      settled.push({ ...row, result: r.kind, settle: r.settle ?? null, reason: r.reason || '', paid: r.paid || 0, settleSig: r.sig, settledAt: r.t });
      if (r.kind !== 'REFUND') { volume += b.stake; if (r.kind === 'WIN') { wins++; paid += r.paid; } else losses++; }
    } else if (o) { open.push(row); volume += b.stake; }
    else pending.push(row);
  }
  open.sort((a, b) => a.expiry - b.expiry);
  settled.sort((a, b) => b.settledAt - a.settledAt);
  return { open, pending, settled: settled.slice(0, 40), stats: { volume, paid, wins, losses, count: wins + losses + open.length } };
}

export default async function handler(req, res) {
  const pool = req.query.w;
  if (!isAddr(pool)) return send(res, 400, { error: 'w' });
  try {
    const data = await cached('book:' + pool, 8000, async () => {
      const [txs, bal] = await Promise.all([history(pool), rpc('getBalance', [pool, { commitment: 'confirmed' }])]);
      const balance = (bal?.value || 0) / 1e9;
      const book = buildBook(pool, txs);
      const owed = book.open.reduce((s, o) => s + o.stake * RULES.PAYOUT_X, 0);
      const maxStake = Math.min(RULES.MAX_STAKE_SOL, balance * RULES.MAX_STAKE_POOL_PCT / 100);
      return { pool, balance, owed, maxStake, ...book };
    });
    send(res, 200, { ...data, rules: RULES, at: Date.now() }, 6);
  } catch (e) { send(res, 502, { error: String(e.message || e) }, 3); }
}
