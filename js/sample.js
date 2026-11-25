// Sample kids' maths workbook, so teachers can try the app without a file.
const n = (v) => ({ t: 'n', v, fmt: 'num', dec: null });
const s = (v) => ({ t: 's', v });

function rng(seed) { let x = seed; return () => ((x = (x * 9301 + 49297) % 233280) / 233280); }

function abacusSheet() {
  const r = rng(42);
  const rows = [];
  for (let ex = 1; ex <= 6; ex++) {
    rows.push([s(`Exercise ${ex}: Add and take away`)]);
    rows.push(Array.from({ length: 10 }, (_, i) => s(`Q${(ex - 1) * 10 + i + 1}`)));
    const cols = Array.from({ length: 10 }, () => {
      let total = 0; const out = [];
      for (let k = 0; k < 5; k++) {
        let v = 1 + Math.floor(r() * 9);
        if (k && r() < 0.35 && total - v >= 0) v = -v;
        total += v; out.push(v);
      }
      return out;
    });
    for (let k = 0; k < 5; k++) rows.push(cols.map(c => n(c[k])));
    rows.push(Array.from({ length: 10 }, () => s('____')));
    rows.push([]);
  }
  return { name: 'Abacus Level 1', rows, merges: [] };
}

function tablesSheet() {
  const rows = [[s('Times Tables 2 to 10')]];
  rows.push([s('Number'), ...Array.from({ length: 9 }, (_, i) => s(`× ${i + 2}`))]);
  for (let a = 1; a <= 12; a++) rows.push([n(a), ...Array.from({ length: 9 }, (_, i) => n(a * (i + 2)))]);
  return { name: 'Times Tables', rows, merges: [{ r1: 0, c1: 0, r2: 0, c2: 9 }] };
}

function namesSheet() {
  const ml = ['ഒന്ന്', 'രണ്ട്', 'മൂന്ന്', 'നാല്', 'അഞ്ച്', 'ആറ്', 'ഏഴ്', 'എട്ട്', 'ഒമ്പത്', 'പത്ത്'];
  const en = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const rows = [[s('Number'), s('In English'), s('മലയാളത്തിൽ'), s('Write it 3 times')]];
  for (let i = 0; i < 10; i++) rows.push([n(i + 1), s(en[i]), s(ml[i]), s('')]);
  return { name: 'Number Names', rows, merges: [] };
}

function scoresSheet() {
  const kids = ['Aadhya', 'Ishaan', 'Meera', 'Arjun', 'Diya', 'Kabir', 'Anika', 'Rohan', 'Sara', 'Vihaan', 'Nila', 'Advik'];
  const r = rng(7);
  const rows = [[s('Student'), s('Test 1'), s('Test 2'), s('Test 3'), s('Test 4'), s('Average'), s('Stars')]];
  for (const k of kids) {
    const t = Array.from({ length: 4 }, () => 12 + Math.floor(r() * 9));
    const avg = t.reduce((a, b) => a + b, 0) / 4;
    rows.push([s(k), ...t.map(n), { t: 'n', v: avg, fmt: 'num', dec: null }, n(Math.round(avg / 4))]);
  }
  return { name: 'Class Scores', rows, merges: [] };
}

export function sampleBook() {
  return { sheets: [abacusSheet(), tablesSheet(), namesSheet(), scoresSheet()] };
}
