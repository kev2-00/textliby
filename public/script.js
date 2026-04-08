'use strict';

(() => {
  const root = document.getElementById('book-grid');
  if (!root) {
    return;
  }

  // Browser storage keys used for remembered UI preferences and one-time migration prompts.
  const STORAGE_KEYS = {
    view: 'textliby_view',
    legacyBooks: 'textliby_books',
    migrationDismissed: 'textliby_migration_dismissed',
  };

  // Human-friendly labels reused across navigation, badges, and empty states.
  const FILTER_TITLES = {
    all: 'All Books',
    unread: 'Unread',
    reading: 'Reading',
    read: 'Finished',
    textbook: 'Textbooks',
    novel: 'Novels',
  };

  const STATUS_LABELS = {
    unread: 'Unread',
    reading: 'Reading',
    read: 'Finished',
  };

  const CATEGORY_LABELS = {
    novel: 'Novel',
    textbook: 'Textbook',
  };

  // Central application state for the authenticated library experience.
  const state = {
    user: null,
    books: [],
    filter: 'all',
    search: '',
    view: getStoredView(),
    addCategory: 'novel',
    googleResults: [],
    selectedBookId: null,
    detailDraft: {
      status: 'unread',
      rating: 0,
      notes: '',
    },
    pendingConfirm: null,
    toastTimer: null,
  };

  // Cache every interactive DOM node once so the rest of the file can work with stable references.
  const elements = {
    sidebar: document.getElementById('sidebar'),
    hamburger: document.getElementById('hamburger'),
    navButtons: Array.from(document.querySelectorAll('.nav-item[data-filter]')),
    navCounts: {
      all: document.getElementById('nav-all'),
      unread: document.getElementById('nav-unread'),
      reading: document.getElementById('nav-reading'),
      read: document.getElementById('nav-read'),
      textbook: document.getElementById('nav-textbook'),
      novel: document.getElementById('nav-novel'),
    },
    searchInput: document.getElementById('lib-search'),
    addTrigger: document.getElementById('add-trigger'),
    addOverlay: document.getElementById('add-overlay'),
    addDrawer: document.getElementById('add-drawer'),
    drawerClose: document.getElementById('drawer-close'),
    queryInput: document.getElementById('gb-query'),
    searchButton: document.getElementById('gb-search-btn'),
    categorySelect: document.getElementById('category-select'),
    categoryOptions: Array.from(document.querySelectorAll('#category-select .pill-opt')),
    googleLoading: document.getElementById('gb-loading'),
    googleResults: document.getElementById('gb-results'),
    manualTitle: document.getElementById('m-title'),
    manualAuthor: document.getElementById('m-author'),
    manualIsbn: document.getElementById('m-isbn'),
    manualYear: document.getElementById('m-year'),
    manualAddButton: document.getElementById('manual-add-btn'),
    stats: {
      total: document.getElementById('stat-total'),
      read: document.getElementById('stat-read'),
      reading: document.getElementById('stat-reading'),
      unread: document.getElementById('stat-unread'),
    },
    sectionTitle: document.getElementById('section-title'),
    viewGrid: document.getElementById('view-grid'),
    viewList: document.getElementById('view-list'),
    bookGrid: document.getElementById('book-grid'),
    emptyState: document.getElementById('empty-state'),
    emptyTitle: document.querySelector('#empty-state h2'),
    emptyText: document.querySelector('#empty-state p'),
    migrationBanner: document.getElementById('migration-banner'),
    migrationCount: document.getElementById('migration-count'),
    migrationImportButton: document.getElementById('migration-import-btn'),
    migrationDismissButton: document.getElementById('migration-dismiss-btn'),
    detailModal: document.getElementById('detail-modal'),
    detailClose: document.getElementById('detail-close'),
    detailCover: document.getElementById('d-cover'),
    detailCoverPlaceholder: document.getElementById('d-cover-placeholder'),
    detailCategory: document.getElementById('d-category'),
    detailStatus: document.getElementById('d-status'),
    detailTitle: document.getElementById('d-title'),
    detailAuthor: document.getElementById('d-author'),
    detailIsbn: document.getElementById('d-isbn'),
    detailPublisher: document.getElementById('d-publisher'),
    detailYear: document.getElementById('d-year'),
    detailAdded: document.getElementById('d-added'),
    detailStatusSelect: document.getElementById('status-select'),
    detailStatusButtons: Array.from(document.querySelectorAll('#status-select .pill-opt')),
    detailStarRow: document.getElementById('star-row'),
    detailStars: Array.from(document.querySelectorAll('#star-row .star')),
    detailNotes: document.getElementById('d-notes'),
    detailSaveButton: document.getElementById('d-save'),
    detailDeleteButton: document.getElementById('d-delete'),
    buyAmazon: document.getElementById('buy-amazon'),
    buyThrift: document.getElementById('buy-thrift'),
    buyGoogle: document.getElementById('buy-google'),
    settingsButton: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    settingsUserEmail: document.getElementById('settings-user-email'),
    settingsExportButton: document.getElementById('settings-export-btn'),
    settingsImportButton: document.getElementById('settings-import-btn'),
    settingsLogoutButton: document.getElementById('settings-logout-btn'),
    clearDataButton: document.getElementById('clear-data-btn'),
    exportButton: document.getElementById('export-btn'),
    importButton: document.getElementById('import-btn'),
    importFile: document.getElementById('import-file'),
    confirmModal: document.getElementById('confirm-modal'),
    confirmMessage: document.getElementById('confirm-msg'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmOk: document.getElementById('confirm-ok'),
    toast: document.getElementById('toast'),
    toastIcon: document.getElementById('toast-icon'),
    toastMessage: document.getElementById('toast-msg'),
  };

  // Start the application once the page-specific DOM structure has been confirmed.
  initialize().catch((error) => {
    console.error(error);
    showToast(error.message || 'Something went wrong while loading your library.', 'error');
  });

  // Bootstrap sequence: bind UI events, restore preferences, then load account data from the server.
  async function initialize() {
    bindEvents();
    applyViewMode();
    syncAddCategory();
    await loadCurrentUser();
    await refreshBooks();
    renderAll();
  }

  // Wire up every sidebar, drawer, modal, and keyboard interaction in one place.
  function bindEvents() {
    elements.searchInput?.addEventListener('input', (event) => {
      state.search = event.target.value.trim().toLowerCase();
      renderBooks();
    });

    elements.navButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter || 'all';
        renderAll();
        closeMobileSidebar();
      });
    });

    elements.viewGrid?.addEventListener('click', () => setViewMode('grid'));
    elements.viewList?.addEventListener('click', () => setViewMode('list'));

    elements.hamburger?.addEventListener('click', () => {
      elements.sidebar?.classList.toggle('mobile-open');
    });

    elements.addTrigger?.addEventListener('click', () => {
      openAddDrawer();
      closeMobileSidebar();
    });

    elements.drawerClose?.addEventListener('click', closeAddDrawer);
    elements.addOverlay?.addEventListener('click', closeAddDrawer);

    elements.searchButton?.addEventListener('click', () => {
      void searchGoogleBooks();
    });

    elements.queryInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void searchGoogleBooks();
      }
    });

    elements.categorySelect?.addEventListener('click', (event) => {
      const button = event.target.closest('.pill-opt');
      if (!button) {
        return;
      }

      state.addCategory = button.dataset.val === 'textbook' ? 'textbook' : 'novel';
      syncAddCategory();
    });

    elements.googleResults?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-google-index]');
      if (!card) {
        return;
      }

      const duplicateId = card.dataset.duplicateId || '';
      if (duplicateId) {
        focusExistingBook(duplicateId, 'That title is already in your library.');
        return;
      }

      const index = Number.parseInt(card.dataset.googleIndex || '', 10);
      if (Number.isNaN(index)) {
        return;
      }

      void addGoogleResult(index);
    });

    elements.manualAddButton?.addEventListener('click', () => {
      void addManualBook();
    });

    elements.bookGrid?.addEventListener('click', (event) => {
      const card = event.target.closest('[data-book-id]');
      if (!card) {
        return;
      }

      const bookId = card.dataset.bookId || '';
      if (!bookId) {
        return;
      }

      openDetailModal(bookId);
      closeMobileSidebar();
    });

    elements.detailClose?.addEventListener('click', closeDetailModal);
    elements.detailModal?.addEventListener('click', (event) => {
      if (event.target === elements.detailModal) {
        closeDetailModal();
      }
    });

    elements.detailStatusSelect?.addEventListener('click', (event) => {
      const button = event.target.closest('.pill-opt');
      if (!button) {
        return;
      }

      const nextStatus = button.dataset.val || 'unread';
      if (!STATUS_LABELS[nextStatus]) {
        return;
      }

      state.detailDraft.status = nextStatus;
      syncDetailControls();
    });

    elements.detailStarRow?.addEventListener('click', (event) => {
      const button = event.target.closest('.star');
      if (!button) {
        return;
      }

      const rating = Number.parseInt(button.dataset.val || '', 10);
      if (Number.isNaN(rating)) {
        return;
      }

      state.detailDraft.rating = rating;
      syncDetailControls();
    });

    elements.detailNotes?.addEventListener('input', (event) => {
      state.detailDraft.notes = event.target.value;
    });

    elements.detailSaveButton?.addEventListener('click', () => {
      void saveDetailChanges();
    });

    elements.detailDeleteButton?.addEventListener('click', () => {
      const book = getSelectedBook();
      if (!book) {
        return;
      }

      requestConfirmation(`Remove "${book.title}" from your library?`, async () => {
        await apiDelete(`/api/books/${book.id}`);
        state.books = state.books.filter((item) => item.id !== book.id);
        closeDetailModal();
        renderAll();
        showToast('Book removed from your library.', 'success');
      });
    });

    elements.settingsButton?.addEventListener('click', () => {
      openModal(elements.settingsModal);
      closeMobileSidebar();
    });

    elements.settingsClose?.addEventListener('click', () => closeModal(elements.settingsModal));
    elements.settingsModal?.addEventListener('click', (event) => {
      if (event.target === elements.settingsModal) {
        closeModal(elements.settingsModal);
      }
    });

    elements.settingsLogoutButton?.addEventListener('click', () => {
      void logout();
    });

    elements.exportButton?.addEventListener('click', exportBooks);
    elements.settingsExportButton?.addEventListener('click', exportBooks);
    elements.importButton?.addEventListener('click', triggerImportPicker);
    elements.settingsImportButton?.addEventListener('click', triggerImportPicker);
    elements.importFile?.addEventListener('change', (event) => {
      void handleImportFileChange(event);
    });

    elements.clearDataButton?.addEventListener('click', () => {
      if (state.books.length === 0) {
        showToast('There are no books to clear yet.');
        return;
      }

      requestConfirmation(
        'This will remove every book from this account. This action cannot be undone.',
        async () => {
          for (const book of [...state.books]) {
            await apiDelete(`/api/books/${book.id}`);
          }

          state.books = [];
          closeModal(elements.settingsModal);
          closeDetailModal();
          renderAll();
          showToast('All books were removed from this account.', 'success');
        }
      );
    });

    elements.migrationImportButton?.addEventListener('click', () => {
      void importLegacyBooks();
    });

    elements.migrationDismissButton?.addEventListener('click', dismissMigrationBanner);

    elements.confirmCancel?.addEventListener('click', closeConfirmModal);
    elements.confirmModal?.addEventListener('click', (event) => {
      if (event.target === elements.confirmModal) {
        closeConfirmModal();
      }
    });

    elements.confirmOk?.addEventListener('click', () => {
      void runConfirmedAction();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isOpen(elements.confirmModal)) {
        closeConfirmModal();
        return;
      }

      if (isOpen(elements.settingsModal)) {
        closeModal(elements.settingsModal);
        return;
      }

      if (isOpen(elements.detailModal)) {
        closeDetailModal();
        return;
      }

      if (isDrawerOpen()) {
        closeAddDrawer();
        return;
      }

      closeMobileSidebar();
    });

    document.addEventListener('click', (event) => {
      if (!elements.sidebar?.classList.contains('mobile-open')) {
        return;
      }

      if (
        elements.sidebar.contains(event.target) ||
        elements.hamburger?.contains(event.target)
      ) {
        return;
      }

      closeMobileSidebar();
    });
  }

  // Initial data loads that establish the signed-in user and their current library contents.
  async function loadCurrentUser() {
    const data = await apiGet('/api/auth/me');
    state.user = data.user;
    syncSettingsUser();
  }

  async function refreshBooks() {
    const data = await apiGet('/api/books');
    state.books = sortBooks(data.books || []);
  }

  // Master render pass that keeps counts, titles, lists, banners, and modals in sync with state.
  function renderAll() {
    renderCounts();
    renderSectionTitle();
    renderBooks();
    renderMigrationBanner();
    syncSettingsUser();

    if (isOpen(elements.detailModal)) {
      const book = getSelectedBook();
      if (!book) {
        closeDetailModal();
      } else {
        populateDetailModal(book);
      }
    }
  }

  // Update sidebar counters and the dashboard stats row from the current library state.
  function renderCounts() {
    const counts = {
      all: state.books.length,
      unread: 0,
      reading: 0,
      read: 0,
      textbook: 0,
      novel: 0,
    };

    for (const book of state.books) {
      if (counts[book.status] !== undefined) {
        counts[book.status] += 1;
      }

      if (counts[book.category] !== undefined) {
        counts[book.category] += 1;
      }
    }

    elements.navButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.filter === state.filter);
    });

    Object.entries(elements.navCounts).forEach(([key, element]) => {
      if (element) {
        element.textContent = String(counts[key] || 0);
      }
    });

    if (elements.stats.total) {
      elements.stats.total.textContent = String(counts.all);
    }

    if (elements.stats.read) {
      elements.stats.read.textContent = String(counts.read);
    }

    if (elements.stats.reading) {
      elements.stats.reading.textContent = String(counts.reading);
    }

    if (elements.stats.unread) {
      elements.stats.unread.textContent = String(counts.unread);
    }
  }

  // Reflect the currently selected filter in the section heading.
  function renderSectionTitle() {
    if (!elements.sectionTitle) {
      return;
    }

    elements.sectionTitle.textContent = FILTER_TITLES[state.filter] || FILTER_TITLES.all;
  }

  // Render either the matching book cards or the appropriate empty state for the current view.
  function renderBooks() {
    const books = getVisibleBooks();

    elements.viewGrid?.classList.toggle('active', state.view === 'grid');
    elements.viewList?.classList.toggle('active', state.view === 'list');
    elements.bookGrid?.classList.toggle('list-view', state.view === 'list');

    if (books.length === 0) {
      if (elements.bookGrid) {
        elements.bookGrid.innerHTML = '';
      }

      if (elements.emptyState) {
        elements.emptyState.style.display = 'block';
      }

      if (state.books.length === 0) {
        if (elements.emptyTitle) {
          elements.emptyTitle.textContent = 'Your library is empty';
        }

        if (elements.emptyText) {
          elements.emptyText.innerHTML =
            'Click <strong>+ Add Book</strong> to search Google Books<br>and add your first title.';
        }
      } else {
        if (elements.emptyTitle) {
          elements.emptyTitle.textContent = 'No books match this view';
        }

        if (elements.emptyText) {
          elements.emptyText.innerHTML =
            'Try a different filter or search term to find the book you want.';
        }
      }

      return;
    }

    if (elements.emptyState) {
      elements.emptyState.style.display = 'none';
    }

    if (elements.bookGrid) {
      elements.bookGrid.innerHTML = books
        .map((book) => (state.view === 'list' ? buildListCard(book) : buildGridCard(book)))
        .join('');
    }
  }

  // Filtering helpers combine sidebar state with the free-text search box.
  function getVisibleBooks() {
    return state.books.filter((book) => matchesCurrentFilter(book) && matchesSearch(book));
  }

  function matchesCurrentFilter(book) {
    if (state.filter === 'all') {
      return true;
    }

    if (state.filter === 'textbook' || state.filter === 'novel') {
      return book.category === state.filter;
    }

    return book.status === state.filter;
  }

  function matchesSearch(book) {
    if (!state.search) {
      return true;
    }

    const haystack = [
      book.title,
      book.author,
      book.isbn,
      book.publisher,
      book.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(state.search);
  }

  // HTML template builders keep DOM rendering simple by returning escaped markup strings.
  function buildGridCard(book) {
    return `
      <article class="book-card status-${escapeAttr(book.status)}" data-book-id="${book.id}">
        <div class="book-cover-wrap">
          ${renderCover(book.thumbnailUrl, 'book-cover', 'book-cover-placeholder')}
        </div>
        <div class="book-card-body">
          <h3 class="book-card-title">${escapeHtml(book.title)}</h3>
          <p class="book-card-author">${escapeHtml(book.author || 'Unknown Author')}</p>
          <div class="book-card-footer">
            <span class="badge badge-${escapeAttr(book.category)}">${escapeHtml(
              CATEGORY_LABELS[book.category] || 'Book'
            )}</span>
            <span class="badge badge-status status-${escapeAttr(book.status)}">${escapeHtml(
              STATUS_LABELS[book.status] || 'Unread'
            )}</span>
          </div>
        </div>
      </article>
    `;
  }

  function buildListCard(book) {
    return `
      <article class="book-card list-card status-${escapeAttr(book.status)}" data-book-id="${book.id}">
        ${renderCover(book.thumbnailUrl, 'list-cover', 'list-cover-ph')}
        <div class="list-info">
          <div class="list-title">${escapeHtml(book.title)}</div>
          <div class="list-author">${escapeHtml(book.author || 'Unknown Author')}</div>
          <div class="list-isbn">${escapeHtml(book.isbn || 'No ISBN')}</div>
        </div>
        <div class="list-meta">
          <span class="badge badge-${escapeAttr(book.category)}">${escapeHtml(
            CATEGORY_LABELS[book.category] || 'Book'
          )}</span>
          <span class="badge badge-status status-${escapeAttr(book.status)}">${escapeHtml(
            STATUS_LABELS[book.status] || 'Unread'
          )}</span>
        </div>
      </article>
    `;
  }

  function renderCover(url, imageClassName, placeholderClassName) {
    if (url) {
      return `<img src="${escapeAttr(url)}" alt="Book cover" class="${imageClassName}" loading="lazy" />`;
    }

    return `<div class="${placeholderClassName}" aria-hidden="true">&#128214;</div>`;
  }

  // Drawer helpers control the add-book side panel and reset any transient search/form state.
  function openAddDrawer() {
    elements.addOverlay?.classList.add('open');
    elements.addDrawer?.classList.add('open');
    syncScrollLock();

    window.requestAnimationFrame(() => {
      if (!elements.queryInput) {
        return;
      }

      try {
        elements.queryInput.focus({ preventScroll: true });
      } catch (error) {
        elements.queryInput.focus();
      }
    });
  }

  function closeAddDrawer() {
    elements.addOverlay?.classList.remove('open');
    elements.addDrawer?.classList.remove('open');
    resetAddDrawer();
    syncScrollLock();
  }

  function isDrawerOpen() {
    return elements.addDrawer?.classList.contains('open');
  }

  function resetAddDrawer() {
    if (elements.queryInput) {
      elements.queryInput.value = '';
    }

    if (elements.manualTitle) {
      elements.manualTitle.value = '';
    }

    if (elements.manualAuthor) {
      elements.manualAuthor.value = '';
    }

    if (elements.manualIsbn) {
      elements.manualIsbn.value = '';
    }

    if (elements.manualYear) {
      elements.manualYear.value = '';
    }

    state.googleResults = [];
    renderGoogleResults([]);
    setGoogleLoading(false);
  }

  // Search Google Books through the server-side proxy, then stage the results for quick adding.
  async function searchGoogleBooks() {
    const query = elements.queryInput?.value.trim() || '';
    if (!query) {
      showToast('Enter a title, author, or ISBN to search Google Books.');
      return;
    }

    setGoogleLoading(true);
    renderGoogleResults([]);

    try {
      const data = await apiGet(`/api/google-books/search?q=${encodeURIComponent(query)}`);
      state.googleResults = data.items || [];
      renderGoogleResults(state.googleResults);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Google Books search failed.', 'error');
    } finally {
      setGoogleLoading(false);
    }
  }

  // Lightweight rendering for the Google Books search results grid.
  function setGoogleLoading(isLoading) {
    if (elements.googleLoading) {
      elements.googleLoading.style.display = isLoading ? 'flex' : 'none';
    }
  }

  function renderGoogleResults(items) {
    if (!elements.googleResults) {
      return;
    }

    if (!items.length) {
      elements.googleResults.innerHTML = '';
      return;
    }

    elements.googleResults.innerHTML = items
      .map((item, index) => {
        const duplicate = findDuplicateBook(item);
        const duplicateId = duplicate ? String(duplicate.id) : '';
        const hintText = duplicate ? 'Already in library' : 'Click to add';
        const hintClass = duplicate ? 'gb-add-hint duplicate' : 'gb-add-hint';

        return `
          <article class="gb-card${duplicate ? ' is-duplicate' : ''}" data-google-index="${index}" data-duplicate-id="${escapeAttr(
            duplicateId
          )}">
            ${
              item.thumbnail
                ? `<img src="${escapeAttr(item.thumbnail)}" alt="Book cover" class="gb-card-thumb" loading="lazy" />`
                : `<div class="gb-card-thumb-ph" aria-hidden="true">&#128214;</div>`
            }
            <div class="gb-card-body">
              <div class="gb-card-title">${escapeHtml(item.title || 'Unknown Title')}</div>
              <div class="gb-card-author">${escapeHtml(item.author || 'Unknown Author')}</div>
              <div class="${hintClass}">${hintText}</div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  // Convert either a Google Books result or the manual form into the API payload used to create a book.
  async function addGoogleResult(index) {
    const item = state.googleResults[index];
    if (!item) {
      return;
    }

    const duplicate = findDuplicateBook(item);
    if (duplicate) {
      focusExistingBook(duplicate.id, 'That title is already in your library.');
      return;
    }

    const payload = {
      title: item.title || '',
      author: item.author || '',
      isbn: item.isbn || '',
      category: state.addCategory,
      status: 'unread',
      rating: 0,
      notes: '',
      thumbnailUrl: item.thumbnail || '',
      publisher: item.publisher || '',
      year: normalizeYear(item.year),
    };

    await createBook(payload, 'Book added from Google Books.');
  }

  async function addManualBook() {
    const payload = {
      title: elements.manualTitle?.value.trim() || '',
      author: elements.manualAuthor?.value.trim() || '',
      isbn: elements.manualIsbn?.value.trim() || '',
      category: state.addCategory,
      status: 'unread',
      rating: 0,
      notes: '',
      thumbnailUrl: '',
      publisher: '',
      year: normalizeYear(elements.manualYear?.value.trim() || ''),
    };

    if (!payload.title) {
      showToast('Add a title before saving the book.', 'error');
      elements.manualTitle?.focus();
      return;
    }

    const duplicate = findDuplicateBook(payload);
    if (duplicate) {
      focusExistingBook(duplicate.id, 'That title is already in your library.');
      return;
    }

    await createBook(payload, 'Book added to your library.');
  }

  // Persist a new book, merge it into local state, and refresh the visible UI.
  async function createBook(payload, successMessage) {
    const duplicate = findDuplicateBook(payload);
    if (duplicate) {
      focusExistingBook(duplicate.id, 'That title is already in your library.');
      return;
    }

    try {
      const data = await apiPost('/api/books', payload);
      state.books = sortBooks([data.book, ...state.books]);
      closeAddDrawer();
      renderAll();
      showToast(successMessage, 'success');
    } catch (error) {
      console.error(error);

      if (error.duplicateId) {
        await refreshBooks();
        renderAll();
        focusExistingBook(error.duplicateId, error.message || 'That title is already in your library.');
        return;
      }

      showToast(error.message || 'Could not add that book.', 'error');
    }
  }

  // Detail modal workflow for inspecting, editing, and deleting the currently selected book.
  function openDetailModal(bookId) {
    state.selectedBookId = bookId;
    const book = getSelectedBook();
    if (!book) {
      return;
    }

    populateDetailModal(book);
    openModal(elements.detailModal);
  }

  function closeDetailModal() {
    closeModal(elements.detailModal);
    state.selectedBookId = null;
  }

  function populateDetailModal(book) {
    state.detailDraft = {
      status: book.status,
      rating: Number(book.rating || 0),
      notes: book.notes || '',
    };

    if (elements.detailCover && elements.detailCoverPlaceholder) {
      if (book.thumbnailUrl) {
        elements.detailCover.src = book.thumbnailUrl;
        elements.detailCover.style.display = 'block';
        elements.detailCoverPlaceholder.style.display = 'none';
      } else {
        elements.detailCover.removeAttribute('src');
        elements.detailCover.style.display = 'none';
        elements.detailCoverPlaceholder.style.display = 'grid';
      }
    }

    if (elements.detailCategory) {
      elements.detailCategory.textContent = CATEGORY_LABELS[book.category] || 'Book';
      elements.detailCategory.className = `badge badge-${book.category}`;
    }

    if (elements.detailStatus) {
      elements.detailStatus.textContent = STATUS_LABELS[book.status] || 'Unread';
      elements.detailStatus.className = `badge badge-status status-${book.status}`;
    }

    if (elements.detailTitle) {
      elements.detailTitle.textContent = book.title;
    }

    if (elements.detailAuthor) {
      elements.detailAuthor.textContent = book.author || 'Unknown Author';
    }

    if (elements.detailIsbn) {
      elements.detailIsbn.textContent = book.isbn || '-';
    }

    if (elements.detailPublisher) {
      elements.detailPublisher.textContent = book.publisher || '-';
    }

    if (elements.detailYear) {
      elements.detailYear.textContent = book.year || '-';
    }

    if (elements.detailAdded) {
      elements.detailAdded.textContent = formatDate(book.addedAt);
    }

    if (elements.detailNotes) {
      elements.detailNotes.value = state.detailDraft.notes;
    }

    syncDetailControls();
    syncBuyLinks(book);
  }

  // Keep status pills and star controls synchronized with the editable draft state.
  function syncDetailControls() {
    elements.detailStatusButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.val === state.detailDraft.status);
    });

    elements.detailStars.forEach((button) => {
      const value = Number.parseInt(button.dataset.val || '', 10);
      button.classList.toggle('lit', value <= state.detailDraft.rating);
    });
  }

  function syncBuyLinks(book) {
    const searchQuery = encodeURIComponent([book.title, book.author].filter(Boolean).join(' '));
    const isbnQuery = book.isbn ? `ISBN ${book.isbn}` : searchQuery;

    if (elements.buyAmazon) {
      elements.buyAmazon.href = `https://www.amazon.com/s?k=${encodeURIComponent(isbnQuery)}`;
    }

    if (elements.buyThrift) {
      elements.buyThrift.href = `https://www.thriftbooks.com/browse/?b.search=${encodeURIComponent(
        isbnQuery
      )}`;
    }

    if (elements.buyGoogle) {
      elements.buyGoogle.href = `https://books.google.com/books?q=${searchQuery}`;
    }
  }

  // Save the draft edits from the detail modal back to the server and update in-memory state.
  async function saveDetailChanges() {
    const book = getSelectedBook();
    if (!book) {
      return;
    }

    try {
      const payload = {
        status: state.detailDraft.status,
        rating: state.detailDraft.rating,
        notes: elements.detailNotes?.value || '',
      };

      const data = await apiPatch(`/api/books/${book.id}`, payload);
      state.books = sortBooks(
        state.books.map((item) => (item.id === data.book.id ? data.book : item))
      );
      renderAll();
      showToast('Book updated.', 'success');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not save your changes.', 'error');
    }
  }

  // Settings, export/import, and migration helpers keep account-level maintenance actions together.
  function syncSettingsUser() {
    if (!elements.settingsUserEmail) {
      return;
    }

    elements.settingsUserEmail.textContent = state.user?.email || 'Not signed in';
  }

  function exportBooks() {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      books: state.books,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `textliby-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showToast('Library exported as JSON.', 'success');
  }

  // Reuse the hidden file input from both the sidebar and settings modal.
  function triggerImportPicker() {
    elements.importFile?.click();
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const books = extractImportBooks(parsed);

      if (!books.length) {
        throw new Error('That file did not contain any books to import.');
      }

      const summary = await importBooksToAccount(books);
      showImportSummaryToast(summary);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not import that file.', 'error');
    }
  }

  // Batch-import books to the authenticated account, then reload from the server as the source of truth.
  async function importBooksToAccount(books) {
    const normalizedBooks = books.map(normalizeImportedBook);
    const data = await apiPost('/api/books/import', { books: normalizedBooks });
    await refreshBooks();
    renderAll();
    closeModal(elements.settingsModal);

    return {
      imported: Number(data.imported || 0),
      skipped: Number(data.skipped || 0),
      duplicates: Number(data.duplicates || 0),
    };
  }

  // Offer one-time migration of the legacy localStorage library into the new account-backed model.
  function renderMigrationBanner() {
    if (!elements.migrationBanner || !elements.migrationCount) {
      return;
    }

    const legacyBooks = getLegacyBooks();
    const dismissed = getMigrationDismissed();

    if (!legacyBooks.length || dismissed) {
      elements.migrationBanner.style.display = 'none';
      return;
    }

    const count = legacyBooks.length;
    elements.migrationCount.textContent = `Import ${count} saved book${
      count === 1 ? '' : 's'
    } from this browser into your account.`;
    elements.migrationBanner.style.display = 'flex';
  }

  async function importLegacyBooks() {
    const legacyBooks = getLegacyBooks();
    if (!legacyBooks.length) {
      dismissMigrationBanner();
      return;
    }

    try {
      const summary = await importBooksToAccount(legacyBooks);
      removeStoredItem(STORAGE_KEYS.legacyBooks);
      removeStoredItem(STORAGE_KEYS.migrationDismissed);
      renderMigrationBanner();
      showImportSummaryToast(summary);
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Could not import your local library.', 'error');
    }
  }

  function dismissMigrationBanner() {
    setStoredItem(STORAGE_KEYS.migrationDismissed, '1');
    renderMigrationBanner();
  }

  // Confirmation modal flow lets destructive actions register an async callback before the user approves.
  function requestConfirmation(message, callback) {
    state.pendingConfirm = callback;
    if (elements.confirmMessage) {
      elements.confirmMessage.textContent = message;
    }

    openModal(elements.confirmModal);
  }

  function closeConfirmModal() {
    state.pendingConfirm = null;
    closeModal(elements.confirmModal);
  }

  async function runConfirmedAction() {
    if (!state.pendingConfirm) {
      closeConfirmModal();
      return;
    }

    const action = state.pendingConfirm;
    state.pendingConfirm = null;
    closeModal(elements.confirmModal);

    try {
      await action();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'That action could not be completed.', 'error');
    }
  }

  // Auth/session utility for signing out without leaving stale UI behind.
  async function logout() {
    try {
      await apiPost('/api/auth/logout');
    } catch (error) {
      console.error(error);
    }

    window.location.assign('/login');
  }

  // Generic view helpers shared by the drawer, modals, sidebar, and list/grid toggle.
  function openModal(element) {
    element?.classList.add('open');
    syncScrollLock();
  }

  function closeModal(element) {
    element?.classList.remove('open');
    syncScrollLock();
  }

  function isOpen(element) {
    return Boolean(element?.classList.contains('open'));
  }

  function closeMobileSidebar() {
    elements.sidebar?.classList.remove('mobile-open');
  }

  function setViewMode(nextView) {
    state.view = nextView === 'list' ? 'list' : 'grid';
    setStoredItem(STORAGE_KEYS.view, state.view);
    applyViewMode();
    renderBooks();
  }

  function applyViewMode() {
    elements.bookGrid?.classList.toggle('list-view', state.view === 'list');
    elements.viewGrid?.classList.toggle('active', state.view === 'grid');
    elements.viewList?.classList.toggle('active', state.view === 'list');
  }

  function syncAddCategory() {
    elements.categoryOptions.forEach((button) => {
      button.classList.toggle('active', button.dataset.val === state.addCategory);
    });
  }

  function getSelectedBook() {
    return state.books.find((book) => String(book.id) === String(state.selectedBookId)) || null;
  }

  function focusExistingBook(bookId, message) {
    closeAddDrawer();
    openDetailModal(String(bookId));
    showToast(message);
  }

  function syncScrollLock() {
    const shouldLock =
      isDrawerOpen() ||
      isOpen(elements.detailModal) ||
      isOpen(elements.settingsModal) ||
      isOpen(elements.confirmModal);

    document.body.classList.toggle('is-locked', shouldLock);
  }

  // Thin HTTP wrappers keep the rest of the UI code agnostic about fetch details.
  async function apiGet(url) {
    return apiRequest(url);
  }

  async function apiPost(url, body) {
    return apiRequest(url, {
      method: 'POST',
      body,
    });
  }

  async function apiPatch(url, body) {
    return apiRequest(url, {
      method: 'PATCH',
      body,
    });
  }

  async function apiDelete(url) {
    return apiRequest(url, {
      method: 'DELETE',
    });
  }

  // Centralized fetch behavior for JSON requests, auth redirects, and API error handling.
  async function apiRequest(url, options = {}) {
    const requestOptions = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {},
    };

    if (options.body !== undefined) {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, requestOptions);
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (response.status === 401) {
      window.location.assign('/login');
      throw new Error('Authentication required.');
    }

    if (!response.ok) {
      const message =
        typeof payload === 'object' && payload && payload.error
          ? payload.error
          : 'Request failed.';
      const error = new Error(message);
      error.status = response.status;

      if (payload && typeof payload === 'object') {
        Object.assign(error, payload);
      }

      throw error;
    }

    return payload;
  }

  // Shared formatting, import normalization, and browser storage helpers.
  function sortBooks(books) {
    return [...books].sort((left, right) => {
      const leftDate = Date.parse(left.addedAt || '') || 0;
      const rightDate = Date.parse(right.addedAt || '') || 0;
      return rightDate - leftDate;
    });
  }

  function formatDate(value) {
    if (!value) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function normalizeYear(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const year = Number.parseInt(String(value).trim(), 10);
    if (!Number.isInteger(year) || year < 0 || year > 9999) {
      return null;
    }

    return year;
  }

  function normalizeDuplicateValue(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function buildDuplicateKeys(book) {
    const title = normalizeDuplicateValue(book?.title);
    const author = normalizeDuplicateValue(book?.author);
    const isbn = normalizeDuplicateValue(book?.isbn);

    return {
      isbn,
      titleAuthor: title ? `${title}::${author}` : '',
    };
  }

  function findDuplicateBook(candidate, options = {}) {
    const ignoreId = options.ignoreId === undefined ? null : String(options.ignoreId);
    const candidateKeys = buildDuplicateKeys(candidate);

    if (!candidateKeys.isbn && !candidateKeys.titleAuthor) {
      return null;
    }

    return (
      state.books.find((book) => {
        if (ignoreId !== null && String(book.id) === ignoreId) {
          return false;
        }

        const bookKeys = buildDuplicateKeys(book);

        if (candidateKeys.isbn && bookKeys.isbn && candidateKeys.isbn === bookKeys.isbn) {
          return true;
        }

        return Boolean(
          candidateKeys.titleAuthor &&
            bookKeys.titleAuthor &&
            candidateKeys.titleAuthor === bookKeys.titleAuthor
        );
      }) || null
    );
  }

  function showImportSummaryToast(summary) {
    const imported = Number(summary?.imported || 0);
    const skipped = Number(summary?.skipped || 0);
    const duplicates = Number(summary?.duplicates || 0);
    const parts = [];

    if (imported > 0) {
      parts.push(`Imported ${imported} book${imported === 1 ? '' : 's'}`);
    } else {
      parts.push('No new books were imported');
    }

    if (duplicates > 0) {
      parts.push(`skipped ${duplicates} duplicate${duplicates === 1 ? '' : 's'}`);
    }

    if (skipped > 0) {
      parts.push(`ignored ${skipped} invalid entr${skipped === 1 ? 'y' : 'ies'}`);
    }

    const kind = imported > 0 ? 'success' : duplicates > 0 || skipped > 0 ? 'info' : 'error';
    showToast(`${parts.join(', ')}.`, kind);
  }

  // Normalize different export/import shapes into the canonical book payload used by the API.
  function normalizeImportedBook(book) {
    const source = book && typeof book === 'object' ? book : {};
    const category = String(source.category ?? source.type ?? 'novel').trim().toLowerCase();
    const status = String(source.status ?? 'unread').trim().toLowerCase();
    const rating = Number.parseInt(String(source.rating ?? 0), 10);

    return {
      title: String(source.title ?? '').trim(),
      author: String(source.author ?? '').trim(),
      isbn: String(source.isbn ?? source.isbn13 ?? '').trim(),
      category: category === 'textbook' ? 'textbook' : 'novel',
      status: STATUS_LABELS[status] ? status : 'unread',
      rating: Number.isInteger(rating) ? Math.min(Math.max(rating, 0), 5) : 0,
      notes: String(source.notes ?? '').trim(),
      thumbnailUrl: String(
        source.thumbnailUrl ?? source.thumbnail ?? source.cover ?? ''
      ).trim(),
      publisher: String(source.publisher ?? '').trim(),
      year: normalizeYear(source.year ?? source.publishedYear ?? ''),
    };
  }

  function extractImportBooks(parsed) {
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && Array.isArray(parsed.books)) {
      return parsed.books;
    }

    return [];
  }

  function getLegacyBooks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.legacyBooks);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Could not read legacy local library:', error);
      return [];
    }
  }

  function getMigrationDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEYS.migrationDismissed) === '1';
    } catch (error) {
      console.warn('Could not read migration dismissal preference:', error);
      return false;
    }
  }

  function getStoredView() {
    try {
      return localStorage.getItem(STORAGE_KEYS.view) === 'list' ? 'list' : 'grid';
    } catch (error) {
      return 'grid';
    }
  }

  // Guard localStorage access so private browsing or browser settings do not break the app.
  function setStoredItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Could not save ${key}:`, error);
    }
  }

  function removeStoredItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Could not remove ${key}:`, error);
    }
  }

  // Small presentation helpers for user feedback and safe HTML string building.
  function showToast(message, kind = 'info') {
    if (!elements.toast || !elements.toastMessage || !elements.toastIcon) {
      return;
    }

    const iconMap = {
      info: 'i',
      success: 'OK',
      error: '!',
    };

    elements.toastIcon.textContent = iconMap[kind] || iconMap.info;
    elements.toastMessage.textContent = message;
    elements.toast.classList.add('show');

    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
    }

    state.toastTimer = window.setTimeout(() => {
      elements.toast?.classList.remove('show');
    }, 2800);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#96;');
  }
})();
