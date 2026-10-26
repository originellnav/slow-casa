// lib/titlecase.js
// Headings across Slow Casa use title case: "Where to Eat in Santa Gertrudis".
// Short joining words (a, and, in, of, to...) stay lower case unless they open
// or close the heading or follow a colon. Words that already carry capitals
// inside them (SOMM, McDonald, nº74) are left alone.

const SMALL = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet',
  'as', 'at', 'by', 'in', 'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'de', 'del', 'des', 'la', 'el', 'es', 'sa', 'en', 'i', 'y'
]);
// Catalan/Spanish articles above stay lower case mid-heading ("Cala de Sant
// Vicent", "Port des Torrent"), matching how the place names are written.

function capWord(w) {
  // Capitalise the first letter only ("Sant Joan de Labritja", "year-round").
  return w.replace(/^\p{Ll}/u, ch => ch.toUpperCase());
}

function titleCase(text) {
  const s = String(text == null ? '' : text);
  // Split into words and the spaces/punctuation between them.
  const parts = s.split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter(i => i >= 0);
  const first = wordIdx[0], last = wordIdx[wordIdx.length - 1];
  let afterColon = false;
  return parts.map((p, i) => {
    if (!/\S/.test(p)) return p;
    const lead = (p.match(/^[^\p{L}\p{N}]*/u) || [''])[0];
    const core = p.slice(lead.length);
    const bare = core.replace(/[^\p{L}\p{N}'’-]+$/u, '').toLowerCase();
    let out;
    if (/\p{Lu}/u.test(core.slice(1))) out = p;                          // SOMM, McQueen: leave
    else if (SMALL.has(bare) && i !== first && i !== last && !afterColon) out = lead + core.toLowerCase();
    else out = lead + capWord(core);
    afterColon = /[:—–]$/.test(p) || /^[—–]$/.test(p);
    return out;
  }).join('');
}

// Same, for a heading that holds inline HTML (links, bold): only the text
// between tags changes. Tags and entities like &amp; are kept as they are.
function titleCaseHtml(html) {
  const s = String(html == null ? '' : html);
  const segs = s.split(/(<[^>]*>|&[#\w]+;)/).filter(x => x !== '');
  const plain = segs.map(x => (x[0] === '<' ? '' : x[0] === '&' && /;$/.test(x) ? '' : x)).join('');
  const tc = titleCase(plain);
  if (tc.length !== plain.length) return s;
  let at = 0;
  return segs.map(x => {
    if (x[0] === '<') return x;
    if (x[0] === '&' && /;$/.test(x)) { at += 1; return x; }
    const out = tc.slice(at, at + x.length); at += x.length; return out;
  }).join('');
}

module.exports = { titleCase, titleCaseHtml };
