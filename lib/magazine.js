// lib/magazine.js
// The Magazine: one grid of island x section.
//   Island hubs (/mallorca) read across a row: houses, where to stay, where to eat, what to do.
//   The Magazine (/magazine, /magazine/where-to-eat) reads down a column, across all islands.
// Sections are filled from two sources:
//   Sanity guides, by their `category` field (see SECTIONS[...].categories)
//   Airtable Places, by their `Category` field (see SECTIONS[...].placeCats).
//   A Place belongs to the island of the first house it is linked to.
// Card markup matches lib/card.js so every grid on the site looks the same.

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = 'appndrnWrdlgxRJAG';
const SANITY_URL = 'https://hchp27po.apicdn.sanity.io/v2024-01-01/data/query/production?query=';
const CACHE_TTL_MS = 5 * 60 * 1000;

const ISLANDS = { mallorca: 'Mallorca', ibiza: 'Ibiza', menorca: 'Menorca' };
const ISLAND_KEYS = Object.keys(ISLANDS);
// Formentera has URLs but no hub yet.
const ALL_ISLAND_PATHS = ['mallorca', 'ibiza', 'menorca', 'formentera'];

// Order here is the order on /magazine.
const SECTIONS = {
  'where-to-stay': {
    label: 'Where to stay',
    categories: ['region-discovery', 'where-to-stay'],
    placeCats: [],
    title: 'Where to Stay in Mallorca, Ibiza & Menorca | Slow Casa',
    description: 'Village by village guides to the best bases in Mallorca, Ibiza and Menorca: what is close, where to eat, where to swim and which houses to book.',
    intro: 'Village by village guides to the best bases on each island: what is close, where to eat, where to swim and which houses to book.'
  },
  'where-to-eat': {
    label: 'Where to eat',
    categories: ['where-to-eat'],
    placeCats: ['Eat', 'Drink', 'Bakery'],
    title: 'Where to Eat in Mallorca, Ibiza & Menorca | Slow Casa',
    description: 'The restaurants, cafés and bars we rate in Mallorca, Ibiza and Menorca, close to the houses in the Slow Casa collection.',
    intro: 'The restaurants, cafés and bars we rate, close to the houses in the collection.'
  },
  'what-to-do': {
    label: 'What to do',
    categories: ['what-to-do'],
    placeCats: ['Swim', 'Play', 'See', 'Do', 'Experience', 'Beach Club'],
    title: 'Things to Do in Mallorca, Ibiza & Menorca | Slow Casa',
    description: 'Beaches, walks and places worth the drive in Mallorca, Ibiza and Menorca, close to the houses in the Slow Casa collection.',
    intro: 'Beaches, walks and places worth the drive, close to the houses in the collection.'
  },
  'house-tours': {
    label: 'House tours',
    categories: ['home-stories', 'architect-stories', 'architect-roundup'],
    placeCats: [],
    title: 'House Tours | Slow Casa',
    description: 'Inside the houses, with the people who made them. Conversations with the architects, designers and owners behind the houses in the collection.',
    intro: 'Inside the houses, with the people who made them.'
  },
  'how-to': {
    label: 'How to',
    categories: ['typology-guide', 'terminology', 'architectural-pilgrimage'],
    placeCats: [],
    title: 'How To | Slow Casa',
    description: 'How these houses get made. Materials, methods and house types across the Balearic Islands.',
    intro: 'How these houses get made. Materials, methods, and the people who know.'
  }
};
const SECTION_KEYS = Object.keys(SECTIONS);

// Sections that get their own indexable page per island: /mallorca/where-to-eat etc.
// These are the pages meant to rank for "where to eat in Mallorca" and similar.
const ISLAND_HUB_SECTIONS = ['where-to-stay', 'where-to-eat', 'what-to-do'];

// The one place that decides a section's URL. With an island and a hub section,
// it's the island hub (/mallorca/where-to-eat); otherwise the Magazine page.
function sectionUrl(section, island) {
  if (island && ISLANDS[island] && ISLAND_HUB_SECTIONS.indexOf(section) !== -1) {
    return '/' + island + '/' + section;
  }
  return '/magazine/' + section + (island && ISLANDS[island] ? '?island=' + island : '');
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function slugify(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function sectionOf(category) {
  for (const k of SECTION_KEYS) {
    if (SECTIONS[k].categories.indexOf(category) !== -1) return k;
  }
  return '';
}
function sectionOfPlace(cat) {
  for (const k of SECTION_KEYS) {
    if (SECTIONS[k].placeCats.indexOf(cat) !== -1) return k;
  }
  return '';
}

function islandOf(value) {
  const k = norm(value);
  return ALL_ISLAND_PATHS.indexOf(k) !== -1 ? k : '';
}

function guideUrl(g) {
  const isl = islandOf(g.island);
  return isl ? '/' + isl + '/' + g.slug : '/guides/' + g.slug;
}

// ---- Images ----
function imgUrl(url, width) {
  if (!url) return '';
  if (url.indexOf('res.cloudinary.com') >= 0) {
    try {
      const parts = url.split('/upload/');
      if (parts.length !== 2) return url;
      const rest = parts[1];
      const versionIdx = rest.search(/\/v\d+\//);
      let trail;
      if (versionIdx >= 0) {
        trail = rest.substring(versionIdx);
      } else {
        const segs = rest.split('/');
        const isTransform = s => s.split(',').every(p => /^(c|w|h|g|q|f|ar|dpr|e|fl|x|y|z|r|o|b|t|a)_[^,]+$/.test(p));
        while (segs.length > 1 && isTransform(segs[0])) segs.shift();
        trail = '/' + segs.join('/');
      }
      return parts[0] + '/upload/c_fill,w_' + width + ',g_auto,q_auto,f_auto' + trail;
    } catch (e) { return url; }
  }
  if (url.indexOf('cdn.sanity.io') >= 0) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'w=' + width + '&auto=format&fit=max&q=80';
  }
  return url;
}

// ---- Places fields ----
// The Places table moved to new field names (Categories, Island, Short Description,
// Website, Image 1/Image 2). Each helper reads the new name first and falls back
// to the old one, so records with either set of fields keep working.
function placeCategories(f) {
  const v = f['Categories'] != null ? f['Categories'] : f['Category'];
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return list.map(c => String(c || '').trim()).filter(Boolean);
}
function placeIslandName(f) { return String(f['Island'] || f['Area'] || '').trim(); }
function placeText(f) { return String(f['Short Description'] || f['Short Discription'] || f['Description'] || f['Note'] || '').trim(); }
function placeLink(f) {
  const raw = String(f['Website'] || f['Link'] || '').trim();
  return /^https?:\/\//i.test(raw) ? raw : '';
}
function attachmentOrUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img.trim();
  if (Array.isArray(img) && img.length) {
    const a = img[0] || {};
    if (a.thumbnails && a.thumbnails.large) return a.thumbnails.large.url;
    return a.url || '';
  }
  return '';
}
// Up to two photos per place: Image 1 and Image 2 (or the old single Image field).
// Instagram post links are not image files, so they are ignored.
function placeImages(f) {
  return [f['Image 1'], f['Image 2'], f['Image']]
    .map(attachmentOrUrl)
    .filter(u => u && !/instagram\.com\//i.test(u))
    .filter((u, i, a) => a.indexOf(u) === i)
    .slice(0, 2);
}

function placeImage(place) {
  return placeImages((place && place.fields) || {})[0] || '';
}

// ---- Data (cached per warm function, fail-soft) ----
const CACHE = {};
async function cached(key, loader) {
  const hit = CACHE[key];
  if (hit && Date.now() < hit.expiresAt) return hit.data;
  try {
    const data = await loader();
    CACHE[key] = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  } catch (e) {
    return hit ? hit.data : [];
  }
}

async function airtableAll(table) {
  let all = [];
  let offset = null;
  let attempts = 0;
  do {
    let url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}?pageSize=100`;
    if (offset) url += `&offset=${encodeURIComponent(offset)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    if (!r.ok) throw new Error('Airtable ' + table + ' ' + r.status);
    const data = await r.json();
    all = all.concat(data.records || []);
    offset = data.offset;
    attempts++;
  } while (offset && attempts < 10);
  return all;
}

function getProperties() { return cached('props', () => airtableAll('Properties')); }
function getPlacesRaw() { return cached('places', () => airtableAll('Places')); }

function getGuides() {
  return cached('guides', async () => {
    const q = `*[_type == "guide" && defined(publishedAt) && defined(slug.current)] | order(publishedAt desc) {
      title, "slug": slug.current, category, island, excerpt, publishedAt,
      "heroImage": { "url": heroImage.asset->url, "alt": heroImage.alt }
    }`;
    const r = await fetch(SANITY_URL + encodeURIComponent(q));
    if (!r.ok) throw new Error('Sanity ' + r.status);
    const data = await r.json();
    return (data.result || []).filter(g => g.slug).map(g => Object.assign({}, g, {
      section: sectionOf(g.category),
      islandKey: islandOf(g.island)
    }));
  });
}

// Places with an island and a section worked out. Drafts and unnamed rows are dropped.
async function getPlaces(props) {
  const [places, properties] = await Promise.all([getPlacesRaw(), props ? Promise.resolve(props) : getProperties()]);
  const islandById = {};
  (properties || []).forEach(p => { islandById[p.id] = islandOf((p.fields || {})['Island']); });
  return (places || [])
    .filter(p => {
      const f = p.fields || {};
      return f['Name'] && String(f['Status'] || '').toLowerCase() !== 'draft';
    })
    .map(p => {
      const f = p.fields;
      const linked = Array.isArray(f['Properties']) ? f['Properties'] : [];
      let isl = '';
      for (const id of linked) { if (islandById[id]) { isl = islandById[id]; break; } }
      if (!isl) isl = islandOf(placeIslandName(f));
      // A place can sit in more than one section (e.g. Eat + Experience).
      const sections = placeCategories(f).map(sectionOfPlace).filter((k, i, a) => k && a.indexOf(k) === i);
      return { id: p.id, fields: f, islandKey: isl, section: sections[0] || '', sections, img: placeImage(p) };
    })
    .filter(p => p.section)
    // Places with a photo first; otherwise keep the Airtable order.
    .sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0));
}

// ---- Cards ----
const DOT = ' <span class="house-card-dot" aria-hidden="true">&#10022;</span> ';

function storyCard(g, opts) {
  opts = opts || {};
  const hero = (g.heroImage && g.heroImage.url) || '';
  const meta = [g.section ? SECTIONS[g.section].label : '', g.islandKey ? ISLANDS[g.islandKey] || '' : '']
    .filter(Boolean).map(esc).join(DOT);
  return `<a class="house-card mag-card" href="${esc(guideUrl(g))}">
      <div class="house-card-img">${hero ? `<img src="${esc(imgUrl(hero, 1000))}" alt="${esc((g.heroImage && g.heroImage.alt) || g.title)}" loading="${opts.eager ? 'eager' : 'lazy'}" />` : ''}</div>
      <p class="house-card-name">${esc(g.title)}</p>
      ${meta ? `<p class="house-card-meta">${meta}</p>` : ''}
      ${g.excerpt ? `<p class="mag-card-text">${esc(g.excerpt)}</p>` : ''}
    </a>`;
}

function placeCard(p) {
  const f = p.fields;
  const meta = [placeCategories(f)[0], String(f['Town'] || '').trim() || placeIslandName(f)].filter(Boolean).map(esc).join(DOT);
  const text = placeText(f);
  const link = placeLink(f);
  const inner = `
      <div class="house-card-img">${p.img ? `<img src="${esc(imgUrl(p.img, 1000))}" alt="${esc(f['Name'])}" loading="lazy" />` : ''}</div>
      <p class="house-card-name">${esc(f['Name'])}</p>
      ${meta ? `<p class="house-card-meta">${meta}</p>` : ''}
      ${text ? `<p class="mag-card-text">${esc(text)}</p>` : ''}`;
  return link
    ? `<a class="house-card mag-card" href="${esc(link)}" target="_blank" rel="noopener">${inner}</a>`
    : `<div class="house-card mag-card">${inner}</div>`;
}

const CHEVRON = '<svg viewBox="0 0 9 15" aria-hidden="true"><path d="M1 1l6.5 6.5L1 14"/></svg>';

// One titled row: heading, optional "See all" link, then a grid of cards. Empty rows render nothing.
function row(o) {
  if (!o.cards || !o.cards.length) return '';
  return `<section class="mag-row"${o.id ? ` id="${esc(o.id)}"` : ''}>
    <div class="mag-row-head">
      <h2>${esc(o.title)}</h2>
      ${o.href ? `<a class="mag-row-link" href="${esc(o.href)}"><span>${esc(o.linkLabel || 'See all')}</span>${CHEVRON}</a>` : ''}
    </div>
    <div class="house-grid">${o.cards.join('')}</div>
  </section>`;
}

// Stories first (newest first), then places.
// Only Balearic content is listed: a guide or place needs an island set. Older
// pieces from elsewhere in Europe stay live at their URLs but no longer appear
// in the Magazine, the island pages or the hubs.
function sectionItems(sectionKey, guides, places, islandKey) {
  const g = guides.filter(x => x.section === sectionKey && x.islandKey && (!islandKey || x.islandKey === islandKey));
  const p = places.filter(x => (x.sections || [x.section]).indexOf(sectionKey) !== -1 && x.islandKey && (!islandKey || x.islandKey === islandKey));
  return { guides: g, places: p, cards: g.map(x => storyCard(x)).concat(p.map(placeCard)) };
}

module.exports = {
  ISLANDS, ISLAND_KEYS, ALL_ISLAND_PATHS, SECTIONS, SECTION_KEYS,
  ISLAND_HUB_SECTIONS, sectionUrl,
  esc, norm, slugify, islandOf, sectionOf, guideUrl, imgUrl,
  getProperties, getGuides, getPlaces,
  storyCard, placeCard, row, sectionItems, CHEVRON,
  placeCategories, placeIslandName, placeText, placeLink, placeImages
};
