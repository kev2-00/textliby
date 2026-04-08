const express = require('express');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const requireAuth = require('../middleware/requireAuth');

// Keep external catalog lookups isolated from local book CRUD routes.
const router = express.Router();

// Prevent a single user from hammering the Google Books proxy endpoint.
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many Google Books searches. Please try again later.' },
});

router.use(requireAuth);

// Prefer ISBN-13 when present, otherwise fall back to the first identifier the API returned.
function extractIsbn(industryIdentifiers = []) {
  const match =
    industryIdentifiers.find((item) => item.type === 'ISBN_13') ||
    industryIdentifiers[0];

  return match ? match.identifier : '';
}

// Proxy Google Books searches so the browser never needs direct access to the API key.
router.get('/search', searchLimiter, async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();

    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required.' });
    }

    if (!config.googleBooksApiKey) {
      return res.status(503).json({ error: 'Google Books API key is not configured.' });
    }

    const params = new URLSearchParams({
      q: query,
      maxResults: '12',
      key: config.googleBooksApiKey,
    });

    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params.toString()}`);

    if (!response.ok) {
      return res.status(502).json({ error: 'Google Books request failed.' });
    }

    const data = await response.json();

    const items = (data.items || []).map((item) => {
      const info = item.volumeInfo || {};

      return {
        id: item.id,
        title: info.title || 'Unknown Title',
        author: (info.authors || []).join(', '),
        isbn: extractIsbn(info.industryIdentifiers || []),
        thumbnail: (info.imageLinks?.thumbnail || '').replace('http://', 'https://'),
        publisher: info.publisher || '',
        year: (info.publishedDate || '').slice(0, 4),
      };
    });

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
