const express = require('express');

const { pool, query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const {
  sanitizeBookInput,
  sanitizeImportBooks,
} = require('../utils/validation');

const router = express.Router();

router.use(requireAuth);

function parseBookId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function mapBookRow(row) {
  return {
    id: Number(row.id),
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    category: row.category,
    status: row.status,
    rating: Number(row.rating),
    notes: row.notes,
    thumbnailUrl: row.thumbnail_url,
    publisher: row.publisher,
    year: row.year,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `
        SELECT *
        FROM books
        WHERE user_id = $1
        ORDER BY added_at DESC
      `,
      [req.user.id]
    );

    res.json({ books: result.rows.map(mapBookRow) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { value, errors } = sanitizeBookInput(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const result = await query(
      `
        INSERT INTO books (
          user_id,
          title,
          author,
          isbn,
          category,
          status,
          rating,
          notes,
          thumbnail_url,
          publisher,
          year
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `,
      [
        req.user.id,
        value.title,
        value.author,
        value.isbn,
        value.category,
        value.status,
        value.rating,
        value.notes,
        value.thumbnailUrl,
        value.publisher,
        value.year,
      ]
    );

    res.status(201).json({ book: mapBookRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const bookId = parseBookId(req.params.id);
    if (!bookId) {
      return res.status(400).json({ error: 'Invalid book id.' });
    }

    const { value, errors } = sanitizeBookInput(req.body, { partial: true });
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const entries = Object.entries(value);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'No valid fields were provided.' });
    }

    const columnMap = {
      title: 'title',
      author: 'author',
      isbn: 'isbn',
      category: 'category',
      status: 'status',
      rating: 'rating',
      notes: 'notes',
      thumbnailUrl: 'thumbnail_url',
      publisher: 'publisher',
      year: 'year',
    };

    const setClauses = [];
    const params = [];
    let index = 1;

    for (const [key, fieldValue] of entries) {
      setClauses.push(`${columnMap[key]} = $${index}`);
      params.push(fieldValue);
      index += 1;
    }

    params.push(bookId, req.user.id);

    const result = await query(
      `
        UPDATE books
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${index}
          AND user_id = $${index + 1}
        RETURNING *
      `,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ book: mapBookRow(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const bookId = parseBookId(req.params.id);
    if (!bookId) {
      return res.status(400).json({ error: 'Invalid book id.' });
    }

    const result = await query(
      `
        DELETE FROM books
        WHERE id = $1
          AND user_id = $2
        RETURNING id
      `,
      [bookId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/import', async (req, res, next) => {
  const source = Array.isArray(req.body) ? req.body : req.body.books;

  if (!Array.isArray(source)) {
    return res.status(400).json({ error: 'Import body must be an array of books.' });
  }

  const { books, skipped } = sanitizeImportBooks(source);
  const client = await pool.connect();

  try {
    let imported = 0;

    await client.query('BEGIN');

    for (const book of books) {
      await client.query(
        `
          INSERT INTO books (
            user_id,
            title,
            author,
            isbn,
            category,
            status,
            rating,
            notes,
            thumbnail_url,
            publisher,
            year
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          req.user.id,
          book.title,
          book.author,
          book.isbn,
          book.category,
          book.status,
          book.rating,
          book.notes,
          book.thumbnailUrl,
          book.publisher,
          book.year,
        ]
      );

      imported += 1;
    }

    await client.query('COMMIT');
    res.json({ imported, skipped });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
