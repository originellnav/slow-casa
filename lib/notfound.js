// lib/notfound.js
// One "page not found" page for the whole site. Page functions call
// notFound(res, what) for a missing house or guide, and /404.html (served by
// Vercel for any unknown URL) is built from notFoundHtml() so they match.
// It returns a real 404 status and is never indexed.

const { nav, footer } = require('./nav');

function notFoundHtml(what) {
  const thing = what || 'page';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page Not Found | Slow Casa</title>
  <meta name="robots" content="noindex" />
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=DM+Serif+Display:ital@0;1&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/slow-casa.css" />
  <style>
    .nf { max-width: 720px; margin: 0 auto; padding: 120px 24px 140px; text-align: center; }
    .nf h1 { font-family: var(--display); font-weight: 400; font-size: clamp(34px, 4vw, 52px); line-height: 1.15; margin: 0 0 20px; }
    .nf p { font-size: 18px; line-height: 1.6; margin: 0 0 36px; }
    .nf-links { display: flex; flex-wrap: wrap; gap: 12px 28px; justify-content: center; }
    .nf-links a { color: inherit; text-decoration: underline; text-underline-offset: 4px; }
  </style>
</head>
<body>
  ${nav()}
  <main class="nf">
    <h1>We Can't Find That ${thing === 'page' ? 'Page' : thing.charAt(0).toUpperCase() + thing.slice(1)}</h1>
    <p>It may have moved, or it's no longer listed. Here are the best places to start.</p>
    <nav class="nf-links" aria-label="Start here">
      <a href="/houses">All Houses</a>
      <a href="/mallorca">Mallorca</a>
      <a href="/ibiza">Ibiza</a>
      <a href="/menorca">Menorca</a>
      <a href="/magazine">The Magazine</a>
    </nav>
  </main>
  ${footer()}
</body>
</html>`;
}

function notFound(res, what) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.end(notFoundHtml(what));
}

module.exports = { notFound, notFoundHtml };
