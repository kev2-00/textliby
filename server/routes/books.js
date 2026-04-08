const express = require('express');

const { pool, query } = require('../db');
const requireAuth = require('../middleware/requireAuth');
const {
  sanitizeBookInput,
  sanitizeImportBooks,
} = require('../utils/validation');

// All book operations live behind the authenticated API router.
const router = express.Router();

router.use(requireAuth);

// Accept only positive integer route params for book records.
function parseBookId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Convert snake_case database rows into the camelCase shape expected by the frontend.
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

function normalizeDuplicateValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildDuplicateKeys(book) {
  const title = normalizeDuplicateValue(book.title);
  const author = normalizeDuplicateValue(book.author);
  const isbn = normalizeDuplicateValue(book.isbn);

  return {
    isbn,
    titleAuthor: title ? `${title}::${author}` : '',
  };
}

function findDuplicateBookRow(rows, candidate, options = {}) {
  const ignoreId = options.ignoreId === undefined ? null : Number(options.ignoreId);
  const candidateKeys = buildDuplicateKeys(candidate);

  if (!candidateKeys.isbn && !candidateKeys.titleAuthor) {
    return null;
  }

  return (
    rows.find((row) => {
      if (ignoreId !== null && Number(row.id) === ignoreId) {
        return false;
      }

      const rowKeys = buildDuplicateKeys(row);

      if (candidateKeys.isbn && rowKeys.isbn && candidateKeys.isbn === rowKeys.isbn) {
        return true;
      }

      return Boolean(
        candidateKeys.titleAuthor &&
          rowKeys.titleAuthor &&
          candidateKeys.titleAuthor === rowKeys.titleAuthor
      );
    }) || null
  );
}

// Return the current user's full library, newest books first.
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

// Insert a single validated book record for the signed-in user.
router.post('/', async (req, res, next) => {
  try {
    const { value, errors } = sanitizeBookInput(req.body);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0] });
    }

    const existingBooks = await query(
      `
        SELECT id, title, author, isbn
        FROM books
        WHERE user_id = $1
      `,
      [req.user.id]
    );
    const duplicate = findDuplicateBookRow(existingBooks.rows, value);

    if (duplicate) {
      return res.status(409).json({
        error: 'That book is already in your library.',
        duplicateId: Number(duplicate.id),
      });
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

// Support partial updates by building the SQL SET clause from only the provided fields.
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

// Remove a single book while ensuring users can delete only their own records.
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

// Import a batch of books inside one transaction so the account update is consistent.
router.post('/import', async (req, res, next) => {
  const source = Array.isArray(req.body) ? req.body : req.body?.books;

  if (!Array.isArray(source)) {
    return res.status(400).json({ error: 'Import body must be an array of books.' });
  }

  const { books, skipped } = sanitizeImportBooks(source);
  const client = await pool.connect();

  try {
    let imported = 0;
    let duplicates = 0;

    await client.query('BEGIN');

    const existingBooks = await client.query(
      `
        SELECT id, title, author, isbn
        FROM books
        WHERE user_id = $1
      `,
      [req.user.id]
    );
    const knownBooks = [...existingBooks.rows];

    for (const book of books) {
      const duplicate = findDuplicateBookRow(knownBooks, book);
      if (duplicate) {
        duplicates += 1;
        continue;
      }

      const insertedBook = await client.query(
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
          RETURNING id, title, author, isbn
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
      knownBooks.push(insertedBook.rows[0]);

      imported += 1;
    }

    await client.query('COMMIT');
    res.json({ imported, skipped, duplicates });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
