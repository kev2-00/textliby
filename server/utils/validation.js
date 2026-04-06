const ALLOWED_CATEGORIES = new Set(['textbook', 'novel']);
const ALLOWED_STATUSES = new Set(['unread', 'reading', 'read']);

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }

  return null;
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseYear(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }

  const year = Number.parseInt(String(value), 10);
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    return { error: 'Year must be a whole number between 0 and 9999.' };
  }

  return { value: year };
}

function parseRating(value) {
  if (value === undefined || value === null || value === '') {
    return { value: 0 };
  }

  const rating = Number.parseInt(String(value), 10);
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return { error: 'Rating must be a whole number between 0 and 5.' };
  }

  return { value: rating };
}

function sanitizeBookInput(input, options = {}) {
  const partial = options.partial === true;
  const source = input && typeof input === 'object' ? input : {};
  const value = {};
  const errors = [];

  if (!partial || hasOwn(source, 'title')) {
    const title = cleanText(source.title, 200);
    if (!title) {
      errors.push('Title is required.');
    } else {
      value.title = title;
    }
  }

  if (!partial || hasOwn(source, 'author')) {
    value.author = cleanText(source.author, 200);
  }

  if (!partial || hasOwn(source, 'isbn')) {
    value.isbn = cleanText(source.isbn, 32);
  }

  if (!partial || hasOwn(source, 'category')) {
    const category = cleanText(source.category || 'novel', 20).toLowerCase() || 'novel';
    if (!ALLOWED_CATEGORIES.has(category)) {
      errors.push('Category must be "textbook" or "novel".');
    } else {
      value.category = category;
    }
  }

  if (!partial || hasOwn(source, 'status')) {
    const status = cleanText(source.status || 'unread', 20).toLowerCase() || 'unread';
    if (!ALLOWED_STATUSES.has(status)) {
      errors.push('Status must be "unread", "reading", or "read".');
    } else {
      value.status = status;
    }
  }

  if (!partial || hasOwn(source, 'rating')) {
    const ratingResult = parseRating(source.rating);
    if (ratingResult.error) {
      errors.push(ratingResult.error);
    } else {
      value.rating = ratingResult.value;
    }
  }

  if (!partial || hasOwn(source, 'notes')) {
    value.notes = cleanText(source.notes, 5000);
  }

  if (!partial || hasOwn(source, 'thumbnailUrl')) {
    value.thumbnailUrl = cleanText(source.thumbnailUrl, 1000);
  }

  if (!partial || hasOwn(source, 'publisher')) {
    value.publisher = cleanText(source.publisher, 200);
  }

  if (!partial || hasOwn(source, 'year')) {
    const yearResult = parseYear(source.year);
    if (yearResult.error) {
      errors.push(yearResult.error);
    } else {
      value.year = yearResult.value;
    }
  }

  return { value, errors };
}

function sanitizeImportBooks(input) {
  const items = Array.isArray(input) ? input : [];
  const books = [];
  let skipped = 0;

  for (const item of items) {
    const { value, errors } = sanitizeBookInput(item);
    if (errors.length > 0) {
      skipped += 1;
      continue;
    }

    books.push(value);
  }

  return { books, skipped };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  validatePassword,
  sanitizeBookInput,
  sanitizeImportBooks,
};
