/**
 * TextLiby — script.js
 * GitHub Pages / Static version
 * Persistence: localStorage  |  Search: Google Books API
 */

'use strict';

// ═══════════════════════════════════════════════
//  STORAGE
// ═══════════════════════════════════════════════

const Store = {
  KEY_BOOKS:    'textliby_books',
  KEY_API:      'textliby_api_key',
  KEY_VIEW:     'textliby_view',

  getBooks()        { return JSON.parse(localStorage.getItem(this.KEY_BOOKS) || '[]'); },
  saveBooks(books)  { localStorage.setItem(this.KEY_BOOKS, JSON.stringify(books)); },
  getApiKey()       { return localStorage.getItem(this.KEY_API) || ''; },
  saveApiKey(k)     { localStorage.setItem(this.KEY_API, k); },
  getView()         { return localStorage.getItem(this.KEY_VIEW) || 'grid'; },
  saveView(v)       { localStorage.setItem(this.KEY_VIEW, v); },

  addBook(book) {
    const books = this.getBooks();
    book.id       = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    book.addedAt  = new Date().toISOString();
    book.status   = 'unread';
    book.rating   = 0;
    book.notes    = '';
    books.unshift(book);
    this.saveBooks(books);
    return book;
  },

  updateBook(id, patch) {
    const books   = this.getBooks();
    const index   = books.findIndex(b => b.id === id);
    if (index === -1) return null;
    books[index]  = { ...books[index], ...patch };
    this.saveBooks(books);
    return books[index];
  },

  deleteBook(id) {
    const books = this.getBooks().filter(b => b.id !== id);
    this.saveBooks(books);
  },

  clearAll() {
    localStorage.removeItem(this.KEY_BOOKS);
  },
};

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════

const State = {
  filter:     'all',
  search:     '',
  view:       Store.getView(),  // 'grid' | 'list'
  activeBook: null,             // book being edited in modal
  confirmCb:  null,             // pending confirm callback
};

// ═══════════════════════════════════════════════
//  DOM REFS
// ═══════════════════════════════════════════════

const $ = id => document.getElementById(id);

const DOM = {
  bookGrid:       $('book-grid'),
  emptyState:     $('empty-state'),
  libSearch:      $('lib-search'),

  // Sidebar nav
  navItems:       document.querySelectorAll('.nav-item'),

  // Stats
  statTotal:      $('stat-total'),
  statRead:       $('stat-read'),
  statReading:    $('stat-reading'),
  statUnread:     $('stat-unread'),

  // Nav badges
  navAll:         $('nav-all'),
  navUnread:      $('nav-unread'),
  navReading:     $('nav-reading'),
  navRead:        $('nav-read'),
  navTextbook:    $('nav-textbook'),
  navNovel:       $('nav-novel'),

  // Drawer
  addTrigger:     $('add-trigger'),
  addOverlay:     $('add-overlay'),
  addDrawer:      $('add-drawer'),
  drawerClose:    $('drawer-close'),
  gbQuery:        $('gb-query'),
  gbSearchBtn:    $('gb-search-btn'),
  gbLoading:      $('gb-loading'),
  gbResults:      $('gb-results'),
  categorySelect: $('category-select'),
  mTitle:         $('m-title'),
  mAuthor:        $('m-author'),
  mIsbn:          $('m-isbn'),
  mYear:          $('m-year'),
  manualAddBtn:   $('manual-add-btn'),

  // Detail modal
  detailModal:    $('detail-modal'),
  detailClose:    $('detail-close'),
  dCover:         $('d-cover'),
  dCoverPh:       $('d-cover-placeholder'),
  dCategory:      $('d-category'),
  dStatus:        $('d-status'),
  dTitle:         $('d-title'),
  dAuthor:        $('d-author'),
  dIsbn:          $('d-isbn'),
  dPublisher:     $('d-publisher'),
  dYear:          $('d-year'),
  dAdded:         $('d-added'),
  statusSelect:   $('status-select'),
  starRow:        $('star-row'),
  dNotes:         $('d-notes'),
  buyAmazon:      $('buy-amazon'),
  buyThrift:      $('buy-thrift'),
  buyGoogle:      $('buy-google'),
  dSave:          $('d-save'),
  dDelete:        $('d-delete'),

  // Settings
  settingsBtn:    $('settings-btn'),
  settingsModal:  $('settings-modal'),
  settingsClose:  $('settings-close'),
  apiKeyInput:    $('api-key-input'),
  settingsSave:   $('settings-save'),
  clearDataBtn:   $('clear-data-btn'),

  // Confirm
  confirmModal:   $('confirm-modal'),
  confirmMsg:     $('confirm-msg'),
  confirmOk:      $('confirm-ok'),
  confirmCancel:  $('confirm-cancel'),

  // View toggle
  viewGrid:       $('view-grid'),
  viewList:       $('view-list'),

  // Section
  sectionTitle:   $('section-title'),

  // Sidebar / hamburger
  sidebar:        $('sidebar'),
  hamburger:      $('hamburger'),

  // Export/import
  exportBtn:      $('export-btn'),
  importBtn:      $('import-btn'),
  importFile:     $('import-file'),

  // Toast
  toast:          $('toast'),
  toastIcon:      $('toast-icon'),
  toastMsg:       $('toast-msg'),
};

// ═══════════════════════════════════════════════
//  RENDER BOOKS
// ═══════════════════════════════════════════════

function filteredBooks() {
  let books = Store.getBooks();

  // Filter
  if (State.filter !== 'all') {
    if (['textbook','novel'].includes(State.filter)) {
      books = books.filter(b => b.category === State.filter);
    } else {
      books = books.filter(b => b.status === State.filter);
    }
  }

  // Search
  if (State.search.trim()) {
    const q = State.search.trim().toLowerCase();
    books = books.filter(b =>
      (b.title  || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.isbn   || '').toLowerCase().includes(q)
    );
  }

  return books;
}

function renderBooks() {
  const books = filteredBooks();
  DOM.bookGrid.innerHTML = '';

  if (!books.length) {
    DOM.emptyState.style.display = 'block';
    DOM.bookGrid.style.display   = 'none';
  } else {
    DOM.emptyState.style.display = 'none';
    DOM.bookGrid.style.display   = '';
    books.forEach((book, i) => {
      const el = State.view === 'list' ? buildListCard(book) : buildGridCard(book);
      el.style.animationDelay = `${i * 30}ms`;
      DOM.bookGrid.appendChild(el);
    });
  }

  updateStats();
  updateSectionTitle();
}

function buildGridCard(book) {
  const card = document.createElement('div');
  card.className = `book-card${book.status === 'read' ? ' status-read' : ''}`;
  card.dataset.id = book.id;

  const coverHTML = book.thumbnail
    ? `<img class="book-cover" src="${esc(book.thumbnail)}" alt="Cover" loading="lazy">`
    : `<div class="book-cover-placeholder">📖</div>`;

  const starsHTML = renderStars(book.rating || 0);

  card.innerHTML = `
    <div class="book-cover-wrap">${coverHTML}</div>
    <div class="book-card-body">
      <div class="book-card-title">${esc(book.title)}</div>
      <div class="book-card-author">${esc(book.author || 'Unknown author')}</div>
      <div class="book-card-footer">
        <span class="badge badge-${esc(book.category || 'novel')}">${esc(book.category || 'novel')}</span>
        <span class="stars">${starsHTML}</span>
      </div>
    </div>`;

  card.addEventListener('click', () => openDetailModal(book.id));
  return card;
}

function buildListCard(book) {
  const card = document.createElement('div');
  card.className = `book-card list-card${book.status === 'read' ? ' status-read' : ''}`;
  card.dataset.id = book.id;

  const coverHTML = book.thumbnail
    ? `<img class="list-cover" src="${esc(book.thumbnail)}" alt="Cover" loading="lazy">`
    : `<div class="list-cover-ph">📖</div>`;

  card.innerHTML = `
    ${coverHTML}
    <div class="list-info">
      <div class="list-title">${esc(book.title)}</div>
      <div class="list-author">${esc(book.author || 'Unknown author')}</div>
      ${book.isbn ? `<div class="list-isbn">${esc(book.isbn)}</div>` : ''}
    </div>
    <div class="list-meta">
      <span class="badge badge-${esc(book.category || 'novel')}">${esc(book.category || 'novel')}</span>
      <span class="badge badge-status status-${esc(book.status || 'unread')}">${statusLabel(book.status)}</span>
    </div>`;

  card.addEventListener('click', () => openDetailModal(book.id));
  return card;
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<span class="${i <= rating ? '' : 'dim'}">★</span>`;
  }
  return html;
}

function statusLabel(s) {
  return { unread: 'Unread', reading: 'Reading', read: 'Finished' }[s] || 'Unread';
}

// ═══════════════════════════════════════════════
//  STATS & BADGES
// ═══════════════════════════════════════════════

function updateStats() {
  const all = Store.getBooks();

  const counts = {
    total:    all.length,
    read:     all.filter(b => b.status === 'read').length,
    reading:  all.filter(b => b.status === 'reading').length,
    unread:   all.filter(b => b.status === 'unread').length,
    textbook: all.filter(b => b.category === 'textbook').length,
    novel:    all.filter(b => b.category === 'novel').length,
  };

  DOM.statTotal.textContent   = counts.total;
  DOM.statRead.textContent    = counts.read;
  DOM.statReading.textContent = counts.reading;
  DOM.statUnread.textContent  = counts.unread;

  DOM.navAll.textContent      = counts.total;
  DOM.navUnread.textContent   = counts.unread;
  DOM.navReading.textContent  = counts.reading;
  DOM.navRead.textContent     = counts.read;
  DOM.navTextbook.textContent = counts.textbook;
  DOM.navNovel.textContent    = counts.novel;
}

function updateSectionTitle() {
  const labels = {
    all: 'All Books', unread: 'Unread', reading: 'Currently Reading',
    read: 'Finished', textbook: 'Textbooks', novel: 'Novels',
  };
  DOM.sectionTitle.textContent = labels[State.filter] || 'All Books';
}

// ═══════════════════════════════════════════════
//  SIDEBAR FILTER
// ═══════════════════════════════════════════════

DOM.navItems.forEach(item => {
  item.addEventListener('click', () => {
    DOM.navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    State.filter = item.dataset.filter;
    // Close sidebar on mobile
    DOM.sidebar.classList.remove('mobile-open');
    renderBooks();
  });
});

// ═══════════════════════════════════════════════
//  SEARCH
// ═══════════════════════════════════════════════

let searchTimer;
DOM.libSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    State.search = DOM.libSearch.value;
    renderBooks();
  }, 280);
});

// ═══════════════════════════════════════════════
//  VIEW TOGGLE (grid / list)
// ═══════════════════════════════════════════════

DOM.viewGrid.addEventListener('click', () => setView('grid'));
DOM.viewList.addEventListener('click', () => setView('list'));

function setView(v) {
  State.view = v;
  Store.saveView(v);
  DOM.bookGrid.className = v === 'list' ? 'book-grid list-view' : 'book-grid';
  DOM.viewGrid.classList.toggle('active', v === 'grid');
  DOM.viewList.classList.toggle('active', v === 'list');
  renderBooks();
}

// ═══════════════════════════════════════════════
//  ADD BOOK DRAWER
// ═══════════════════════════════════════════════

DOM.addTrigger.addEventListener('click', openDrawer);
DOM.addOverlay.addEventListener('click', closeDrawer);
DOM.drawerClose.addEventListener('click', closeDrawer);

function openDrawer() {
  DOM.addDrawer.classList.add('open');
  DOM.addOverlay.classList.add('open');
  DOM.gbQuery.focus();
}
function closeDrawer() {
  DOM.addDrawer.classList.remove('open');
  DOM.addOverlay.classList.remove('open');
  DOM.gbResults.innerHTML = '';
  DOM.gbQuery.value = '';
}

// ── Category pill select (drawer) ────────────
document.querySelectorAll('#category-select .pill-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#category-select .pill-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

function selectedCategory() {
  return document.querySelector('#category-select .pill-opt.active')?.dataset.val || 'novel';
}

// ═══════════════════════════════════════════════
//  GOOGLE BOOKS SEARCH
// ═══════════════════════════════════════════════

DOM.gbSearchBtn.addEventListener('click', searchGoogleBooks);
DOM.gbQuery.addEventListener('keydown', e => { if (e.key === 'Enter') searchGoogleBooks(); });

async function searchGoogleBooks() {
  const query = DOM.gbQuery.value.trim();
  if (!query) { showToast('Enter a search term first.', '⚠️'); return; }

  DOM.gbResults.innerHTML = '';
  DOM.gbLoading.style.display = 'flex';

  const apiKey = Store.getApiKey();
  const params = new URLSearchParams({ q: query, maxResults: '12' });
  if (apiKey) params.append('key', apiKey);

  try {
    const res  = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
    const data = await res.json();
    DOM.gbLoading.style.display = 'none';

    if (!data.items?.length) {
      DOM.gbResults.innerHTML = '<p style="padding:0 0 12px;color:var(--muted);font-size:13px;">No results found. Try a different term.</p>';
      return;
    }

    data.items.forEach(item => {
      const info   = item.volumeInfo || {};
      const title  = info.title || 'Unknown Title';
      const author = (info.authors || []).join(', ') || '';
      const isbn   = (info.industryIdentifiers || []).find(i => i.type === 'ISBN_13')?.identifier
                  || (info.industryIdentifiers || [])[0]?.identifier || '';
      const thumb  = (info.imageLinks?.thumbnail || '').replace('http://', 'https://');
      const pub    = info.publisher || '';
      const year   = (info.publishedDate || '').slice(0, 4);

      const card = document.createElement('div');
      card.className = 'gb-card';
      card.innerHTML = `
        ${thumb ? `<img class="gb-card-thumb" src="${esc(thumb)}" alt="Cover" loading="lazy">`
                : `<div class="gb-card-thumb-ph">📖</div>`}
        <div class="gb-card-body">
          <div class="gb-card-title">${esc(title)}</div>
          <div class="gb-card-author">${esc(author)}</div>
          <div class="gb-add-hint">＋ Add</div>
        </div>`;

      card.addEventListener('click', () => {
        addBook({ title, author, isbn, category: selectedCategory(),
                  thumbnail: thumb, publisher: pub, year });
      });
      DOM.gbResults.appendChild(card);
    });
  } catch (err) {
    DOM.gbLoading.style.display = 'none';
    DOM.gbResults.innerHTML = `<p style="color:var(--red);font-size:13px;padding:0 0 12px;">
      API error — check your key in Settings, or try again.</p>`;
    console.error('Google Books error:', err);
  }
}

// ── Manual add ────────────────────────────────
DOM.manualAddBtn.addEventListener('click', () => {
  const title = DOM.mTitle.value.trim();
  if (!title) { showToast('Title is required.', '⚠️'); DOM.mTitle.focus(); return; }
  addBook({
    title,
    author:    DOM.mAuthor.value.trim(),
    isbn:      DOM.mIsbn.value.trim(),
    year:      DOM.mYear.value.trim(),
    category:  selectedCategory(),
    thumbnail: '', publisher: '',
  });
  DOM.mTitle.value = DOM.mAuthor.value = DOM.mIsbn.value = DOM.mYear.value = '';
});

function addBook(data) {
  const book = Store.addBook(data);
  showToast(`"${book.title}" added!`, '✅');
  closeDrawer();
  renderBooks();
}

// ═══════════════════════════════════════════════
//  DETAIL MODAL
// ═══════════════════════════════════════════════

DOM.detailClose.addEventListener('click', closeDetailModal);
DOM.detailModal.addEventListener('click', e => { if (e.target === DOM.detailModal) closeDetailModal(); });

function openDetailModal(id) {
  const book = Store.getBooks().find(b => b.id === id);
  if (!book) return;
  State.activeBook = id;

  // Cover
  if (book.thumbnail) {
    DOM.dCover.src              = book.thumbnail;
    DOM.dCover.style.display    = 'block';
    DOM.dCoverPh.style.display  = 'none';
  } else {
    DOM.dCover.style.display    = 'none';
    DOM.dCoverPh.style.display  = 'grid';
  }

  // Category badge
  DOM.dCategory.textContent  = book.category || 'novel';
  DOM.dCategory.className    = `badge badge-${book.category || 'novel'}`;

  // Status badge
  DOM.dStatus.textContent = statusLabel(book.status);
  DOM.dStatus.className   = `badge badge-status status-${book.status || 'unread'}`;

  // Info
  DOM.dTitle.textContent     = book.title;
  DOM.dAuthor.textContent    = book.author || 'Unknown author';
  DOM.dIsbn.textContent      = book.isbn   || '—';
  DOM.dPublisher.textContent = book.publisher || '—';
  DOM.dYear.textContent      = book.year   || '—';
  DOM.dAdded.textContent     = book.addedAt
    ? new Date(book.addedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
    : '—';

  // Status pill select
  document.querySelectorAll('#status-select .pill-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === (book.status || 'unread'));
  });

  // Stars
  setStarDisplay(book.rating || 0);

  // Notes
  DOM.dNotes.value = book.notes || '';

  // Buy links
  const q          = encodeURIComponent(`${book.title} ${book.author}`);
  const isbnQuery  = book.isbn ? encodeURIComponent(book.isbn) : q;
  DOM.buyAmazon.href = `https://www.amazon.com/s?k=${isbnQuery}`;
  DOM.buyThrift.href = `https://www.thriftbooks.com/browse/?b.search=${q}`;
  DOM.buyGoogle.href = `https://books.google.com/books?q=${q}`;

  DOM.detailModal.classList.add('open');
}

function closeDetailModal() {
  DOM.detailModal.classList.remove('open');
  State.activeBook = null;
}

// ── Status pill select (modal) ────────────────
document.querySelectorAll('#status-select .pill-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#status-select .pill-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // update badge live
    const s = btn.dataset.val;
    DOM.dStatus.textContent = statusLabel(s);
    DOM.dStatus.className   = `badge badge-status status-${s}`;
  });
});

// ── Star rating ───────────────────────────────
let hoveredRating = 0;

document.querySelectorAll('#star-row .star').forEach(star => {
  star.addEventListener('mouseenter', () => {
    hoveredRating = parseInt(star.dataset.val);
    setStarDisplay(hoveredRating);
  });
  star.addEventListener('mouseleave', () => {
    const active = document.querySelector('#star-row .star.active');
    setStarDisplay(active ? parseInt(active.dataset.val) : 0);
  });
  star.addEventListener('click', () => {
    const val = parseInt(star.dataset.val);
    document.querySelectorAll('#star-row .star').forEach(s => s.classList.remove('active'));
    star.classList.add('active');
    setStarDisplay(val);
  });
});

function setStarDisplay(rating) {
  document.querySelectorAll('#star-row .star').forEach(s => {
    const v = parseInt(s.dataset.val);
    s.classList.toggle('lit', v <= rating);
  });
}

function getSelectedRating() {
  const active = document.querySelector('#star-row .star.active');
  if (active) return parseInt(active.dataset.val);
  const lit = [...document.querySelectorAll('#star-row .star.lit')];
  return lit.length;
}

// ── Save changes ──────────────────────────────
DOM.dSave.addEventListener('click', () => {
  if (!State.activeBook) return;
  const status = document.querySelector('#status-select .pill-opt.active')?.dataset.val || 'unread';
  const rating = getSelectedRating();
  Store.updateBook(State.activeBook, { status, rating, notes: DOM.dNotes.value.trim() });
  showToast('Changes saved!', '✅');
  closeDetailModal();
  renderBooks();
});

// ── Delete ────────────────────────────────────
DOM.dDelete.addEventListener('click', () => {
  if (!State.activeBook) return;
  const book = Store.getBooks().find(b => b.id === State.activeBook);
  if (!book) return;
  confirmAction(
    `Remove "${book.title}" from your library? This cannot be undone.`,
    () => {
      Store.deleteBook(State.activeBook);
      showToast('Book removed.', '🗑');
      closeDetailModal();
      renderBooks();
    }
  );
});

// ═══════════════════════════════════════════════
//  SETTINGS MODAL
// ═══════════════════════════════════════════════

DOM.settingsBtn.addEventListener('click', () => {
  DOM.apiKeyInput.value = Store.getApiKey();
  DOM.settingsModal.classList.add('open');
});
DOM.settingsClose.addEventListener('click', () => DOM.settingsModal.classList.remove('open'));
DOM.settingsModal.addEventListener('click', e => { if (e.target === DOM.settingsModal) DOM.settingsModal.classList.remove('open'); });

DOM.settingsSave.addEventListener('click', () => {
  Store.saveApiKey(DOM.apiKeyInput.value.trim());
  DOM.settingsModal.classList.remove('open');
  showToast('Settings saved!', '✅');
});

DOM.clearDataBtn.addEventListener('click', () => {
  confirmAction('Clear ALL books from your library? This cannot be undone.', () => {
    Store.clearAll();
    showToast('Library cleared.', '🗑');
    renderBooks();
  });
});

// ═══════════════════════════════════════════════
//  CONFIRM MODAL
// ═══════════════════════════════════════════════

function confirmAction(msg, cb) {
  DOM.confirmMsg.textContent = msg;
  State.confirmCb = cb;
  DOM.confirmModal.classList.add('open');
}

DOM.confirmOk.addEventListener('click', () => {
  DOM.confirmModal.classList.remove('open');
  if (State.confirmCb) { State.confirmCb(); State.confirmCb = null; }
});
DOM.confirmCancel.addEventListener('click', () => {
  DOM.confirmModal.classList.remove('open');
  State.confirmCb = null;
});
DOM.confirmModal.addEventListener('click', e => {
  if (e.target === DOM.confirmModal) {
    DOM.confirmModal.classList.remove('open');
    State.confirmCb = null;
  }
});

// ═══════════════════════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════════════════════

DOM.exportBtn.addEventListener('click', () => {
  const books = Store.getBooks();
  const blob  = new Blob([JSON.stringify(books, null, 2)], { type: 'application/json' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = `textliby-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Library exported!', '↓');
});

DOM.importBtn.addEventListener('click', () => DOM.importFile.click());

DOM.importFile.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text  = await file.text();
    const books = JSON.parse(text);
    if (!Array.isArray(books)) throw new Error('Not an array');
    Store.saveBooks(books);
    showToast(`Imported ${books.length} books!`, '✅');
    renderBooks();
  } catch {
    showToast('Invalid JSON file.', '❌');
  }
  DOM.importFile.value = '';
});

// ═══════════════════════════════════════════════
//  SIDEBAR (mobile hamburger)
// ═══════════════════════════════════════════════

DOM.hamburger.addEventListener('click', () => {
  DOM.sidebar.classList.toggle('mobile-open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', e => {
  if (window.innerWidth <= 768 &&
      !DOM.sidebar.contains(e.target) &&
      e.target !== DOM.hamburger) {
    DOM.sidebar.classList.remove('mobile-open');
  }
});

// ═══════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════

let toastTimer;
function showToast(msg, icon = '✓') {
  DOM.toastIcon.textContent = icon;
  DOM.toastMsg.textContent  = msg;
  DOM.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeDrawer();
    closeDetailModal();
    DOM.settingsModal.classList.remove('open');
    DOM.confirmModal.classList.remove('open');
    DOM.sidebar.classList.remove('mobile-open');
  }
  // Ctrl/Cmd + K → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    DOM.libSearch.focus();
  }
  // N → open add drawer (when no modal is open)
  if (e.key === 'n' && !DOM.addDrawer.classList.contains('open') &&
      !DOM.detailModal.classList.contains('open') &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA') {
    openDrawer();
  }
});

// ═══════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════

(function init() {
  setView(State.view);
  renderBooks();

  // Load saved API key into settings field
  DOM.apiKeyInput.value = Store.getApiKey();
})();
