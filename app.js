/**
 * app.js — Luminote main controller
 */

const App = {
  currentScreen: 'home',
  currentBook: null,
  activeFilter: 'all',
  activeChapterFilter: 'all',
  activeSortFilter: 'order',
  stackBookFilter: 'all',
  stackFilter: 'all',

  // ── Init ──────────────────────────────────────────────────
  init() {
    this.bindNav();
    this.bindUpload();
    this.bindFilterToggle();
    this.bindFilterChips();
    this.bindStackFilters();
    this.bindRandomizer();
    this.bindSettings();
    this.bindBackBtn();
    this.renderHome();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  },

  // ── Navigation ────────────────────────────────────────────
  bindNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        this.navigateTo(screen);
      });
    });
  },

  navigateTo(screenId, options = {}) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    const screen = document.getElementById(`screen-${screenId}`);
    if (screen) screen.classList.add('active');

    const navBtn = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Show/hide bottom nav for deepdive
    const nav = document.getElementById('bottom-nav');
    nav.style.display = screenId === 'deepdive' ? 'none' : '';

    this.currentScreen = screenId;

    if (screenId === 'home') this.renderHome();
    if (screenId === 'stack') this.renderStack();
    if (screenId === 'randomizer') this.renderRandomizer();
  },

  openBook(bookId) {
    const books = LuminoteStore.getBooks();
    const book = books.find(b => b.id === bookId);
    if (!book) return;
    this.currentBook = book;
    this.activeFilter = 'all';
    this.activeChapterFilter = 'all';
    this.activeSortFilter = 'order';

    document.getElementById('dive-book-title').textContent = book.title;
    document.getElementById('dive-author').textContent = book.author;

    // Hide filter bar
    document.getElementById('filter-bar').style.display = 'none';
    document.getElementById('btn-filter-toggle').classList.remove('active');

    this.buildChapterNav(book);
    this.buildChapterFilterDropdown(book);
    this.renderHighlights();

    // Navigate (hide bottom nav)
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-deepdive').classList.add('active');
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('screen-deepdive').scrollTop = 0;
    this.currentScreen = 'deepdive';
  },

  // ── Home ──────────────────────────────────────────────────
  renderHome() {
    const books = LuminoteStore.getBooks();
    const grid = document.getElementById('books-grid');
    const emptyState = document.getElementById('empty-state');
    const statsBar = document.getElementById('home-stats');
    const stats = LuminoteStore.getStats();

    // Stats
    if (books.length > 0) {
      statsBar.style.display = 'flex';
      document.getElementById('stat-books').textContent = stats.books;
      document.getElementById('stat-highlights').textContent = stats.highlights;
      document.getElementById('stat-bulbs').textContent = stats.bulbed;
    } else {
      statsBar.style.display = 'none';
    }

    // Clear grid (keep empty state)
    Array.from(grid.children).forEach(child => {
      if (child.id !== 'empty-state') child.remove();
    });

    if (books.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    books.forEach(book => {
      const card = this.createBookCard(book);
      grid.appendChild(card);
    });
  },

  createBookCard(book) {
    const bulbCount = book.highlights.filter(h => h.bulbed).length;
    const div = document.createElement('div');
    div.className = 'book-card';
    div.innerHTML = `
      <div class="book-cover" style="background:${book.color || '#f2f2f0'}">
        <div class="book-cover-placeholder">
          <svg class="book-cover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <span class="placeholder-title">${this.escHtml(book.title)}</span>
        </div>
      </div>
      <div class="book-card-body">
        <div class="book-card-title">${this.escHtml(book.title)}</div>
        <div class="book-card-author">${this.escHtml(book.author)}</div>
        <div class="book-card-meta">
          <span class="book-card-count">${book.highlights.length} highlights</span>
          ${bulbCount > 0 ? `<span class="book-card-bulb-count">⚡ ${bulbCount}</span>` : ''}
        </div>
      </div>
    `;
    div.addEventListener('click', () => this.openBook(book.id));
    return div;
  },

  // ── Upload ────────────────────────────────────────────────
  bindUpload() {
    const fileInput = document.getElementById('file-input');

    ['btn-upload-home', 'btn-upload-empty', 'btn-upload-settings'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => fileInput.click());
    });

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;

      for (const file of files) {
        await this.processFile(file);
      }
      fileInput.value = '';
      this.renderHome();
    });
  },

  async processFile(file) {
    this.showToast('Parsing highlights…');
    try {
      const book = await LuminotePDFParser.parseFile(file);
      if (!book.title) {
        this.showToast('Could not read file — is it a Play Books PDF?');
        return;
      }
      const result = LuminoteStore.addBook(book);
      if (result.added) {
        this.showToast(`✓ Added "${book.title}" — ${book.highlights.length} highlights`);
      } else {
        this.showToast(`"${book.title}" is already in your library`);
      }
    } catch (err) {
      console.error(err);
      this.showToast('Error parsing PDF. Try another file.');
    }
  },

  // ── Deep Dive ─────────────────────────────────────────────
  bindBackBtn() {
    document.getElementById('btn-back').addEventListener('click', () => {
      this.navigateTo('home');
    });
  },

  bindFilterToggle() {
    const btn = document.getElementById('btn-filter-toggle');
    const bar = document.getElementById('filter-bar');
    btn.addEventListener('click', () => {
      const isHidden = bar.style.display === 'none';
      bar.style.display = isHidden ? 'block' : 'none';
      btn.style.background = isHidden ? 'var(--accent-light)' : '';
      btn.style.color = isHidden ? 'var(--accent)' : '';
    });
  },

  bindFilterChips() {
    // Deep dive filter chips
    document.querySelectorAll('[data-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.dataset.filter;
        this.renderHighlights();
      });
    });

    // Chapter filter
    document.getElementById('chapter-filter').addEventListener('change', (e) => {
      this.activeChapterFilter = e.target.value;
      this.renderHighlights();
    });

    // Sort filter
    document.getElementById('sort-filter').addEventListener('change', (e) => {
      this.activeSortFilter = e.target.value;
      this.renderHighlights();
    });
  },

  buildChapterNav(book) {
    const nav = document.getElementById('chapter-nav');
    nav.innerHTML = '';
    if (!book.chapters.length) return;

    book.chapters.forEach(ch => {
      const pill = document.createElement('button');
      pill.className = 'chapter-pill';
      pill.textContent = ch;
      pill.addEventListener('click', () => {
        // Scroll to chapter divider
        const dividers = document.querySelectorAll('.chapter-divider');
        dividers.forEach(d => {
          if (d.textContent === ch) {
            d.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
      nav.appendChild(pill);
    });
  },

  buildChapterFilterDropdown(book) {
    const sel = document.getElementById('chapter-filter');
    sel.innerHTML = '<option value="all">All chapters</option>';
    book.chapters.forEach(ch => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = ch.length > 40 ? ch.slice(0, 40) + '…' : ch;
      sel.appendChild(opt);
    });
  },

  getFilteredHighlights() {
    if (!this.currentBook) return [];
    let highlights = [...this.currentBook.highlights];

    // Filter by bulbed/recent
    if (this.activeFilter === 'bulbed') {
      highlights = highlights.filter(h => h.bulbed);
    } else if (this.activeFilter === 'recent') {
      // Most recently highlighted
      highlights = highlights.filter(h => h.date).sort((a, b) =>
        new Date(b.date) - new Date(a.date)
      ).slice(0, 20);
    }

    // Chapter filter
    if (this.activeChapterFilter !== 'all') {
      highlights = highlights.filter(h => h.chapter === this.activeChapterFilter);
    }

    // Sort
    const sort = this.activeSortFilter;
    if (sort === 'date-new') {
      highlights = highlights.sort((a, b) => new Date(b.date) - new Date(a.date));
    } else if (sort === 'date-old') {
      highlights = highlights.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (sort === 'length-long') {
      highlights = highlights.sort((a, b) => b.text.length - a.text.length);
    } else if (sort === 'length-short') {
      highlights = highlights.sort((a, b) => a.text.length - b.text.length);
    }
    // 'order' = natural (no change)

    return highlights;
  },

  renderHighlights() {
    const feed = document.getElementById('highlights-feed');
    feed.innerHTML = '';

    const highlights = this.getFilteredHighlights();

    if (highlights.length === 0) {
      feed.innerHTML = `<div class="empty-state"><p class="empty-title">No highlights</p><p class="empty-sub">Try a different filter</p></div>`;
      return;
    }

    // Group by chapter if showing all
    if (this.activeFilter !== 'recent' && this.activeChapterFilter === 'all' && this.activeSortFilter === 'order') {
      let lastChapter = null;
      highlights.forEach(h => {
        if (h.chapter !== lastChapter) {
          const div = document.createElement('div');
          div.className = 'chapter-divider';
          div.textContent = h.chapter;
          feed.appendChild(div);
          lastChapter = h.chapter;
        }
        feed.appendChild(this.createHighlightCard(h, this.currentBook.id, this.currentBook.title));
      });
    } else {
      highlights.forEach(h => {
        feed.appendChild(this.createHighlightCard(h, this.currentBook.id, this.currentBook.title));
      });
    }
  },

  createHighlightCard(h, bookId, bookTitle, showBookTag = false) {
    const card = document.createElement('div');
    card.className = `highlight-card${h.bulbed ? ' is-bulbed' : ''}`;
    card.dataset.hid = h.id;

    const pageLink = `https://play.google.com/books/reader?id=&pg=${h.page}`;

    card.innerHTML = `
      ${showBookTag ? `<span class="highlight-book-tag">${this.escHtml(bookTitle || '')}</span>` : ''}
      <div class="highlight-text">${this.escHtml(h.text)}</div>
      <div class="highlight-meta">
        <div class="highlight-info">
          <span class="highlight-page">p. ${h.page}</span>
          ${h.date ? `<span class="highlight-date">${h.date}</span>` : ''}
        </div>
        <div class="highlight-actions">
          <button class="action-btn bulb-btn${h.bulbed ? ' active' : ''}" title="Bulb this highlight" data-action="bulb" data-hid="${h.id}" data-bid="${bookId}">
            <svg viewBox="0 0 24 24" fill="${h.bulbed ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
              <path d="M9 21h6M12 3a6 6 0 014.472 10.05C15.97 13.56 15.5 14.8 15.5 16H8.5c0-1.2-.47-2.44-.972-2.95A6 6 0 0112 3z"/>
            </svg>
          </button>
          <button class="action-btn copy-btn" title="Copy text" data-action="copy" data-text="${this.escAttr(h.text)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <a class="action-btn jump-btn" href="${pageLink}" target="_blank" rel="noopener" title="Open in Play Books (p.${h.page})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </a>
        </div>
      </div>
    `;

    // Bind actions
    card.querySelector('[data-action="bulb"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const newState = LuminoteStore.toggleBulb(bookId, h.id);
      h.bulbed = newState;

      const btn = card.querySelector('.bulb-btn');
      btn.classList.toggle('active', newState);
      card.classList.toggle('is-bulbed', newState);
      const svgPath = btn.querySelector('svg');
      if (svgPath) svgPath.setAttribute('fill', newState ? 'currentColor' : 'none');

      this.showToast(newState ? '⚡ Bulbed!' : 'Removed from bulbs');
      this.updateStats();

      // If we're in stack view, refresh
      if (this.currentScreen === 'stack') this.renderStack();
    });

    card.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const text = e.currentTarget.dataset.text;
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('Copied!');
      }).catch(() => {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.showToast('Copied!');
      });
    });

    return card;
  },

  // ── Stack ─────────────────────────────────────────────────
  bindStackFilters() {
    document.querySelectorAll('[data-stack-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-stack-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.stackFilter = chip.dataset.stackFilter;
        this.renderStack();
      });
    });

    document.getElementById('stack-book-filter').addEventListener('change', (e) => {
      this.stackBookFilter = e.target.value;
      this.renderStack();
    });
  },

  renderStack() {
    const feed = document.getElementById('stack-feed');
    const empty = document.getElementById('stack-empty');
    feed.innerHTML = '';

    // Populate book dropdown
    const books = LuminoteStore.getBooks();
    const sel = document.getElementById('stack-book-filter');
    const prevVal = sel.value;
    sel.innerHTML = '<option value="all">All books</option>';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.title;
      sel.appendChild(opt);
    });
    sel.value = prevVal || 'all';

    let bulbed = LuminoteStore.getAllBulbed();

    if (this.stackBookFilter !== 'all') {
      bulbed = bulbed.filter(h => h.bookId === this.stackBookFilter);
    }

    if (this.stackFilter === 'recent') {
      bulbed = bulbed.filter(h => h.date).sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    if (bulbed.length === 0) {
      empty.style.display = 'flex';
      return;
    }

    empty.style.display = 'none';
    bulbed.forEach(h => {
      feed.appendChild(this.createHighlightCard(h, h.bookId, h.bookTitle, true));
    });
  },

  // ── Randomizer ────────────────────────────────────────────
  bindRandomizer() {
    document.getElementById('btn-randomize').addEventListener('click', () => {
      this.showRandomHighlight();
    });
  },

  renderRandomizer() {
    // Reset to initial state if no highlights yet shown
    const card = document.getElementById('random-card');
    if (!card.dataset.loaded) return;
  },

  showRandomHighlight() {
    const all = LuminoteStore.getAllHighlights();
    if (!all.length) {
      this.showToast('No highlights yet — upload a book!');
      return;
    }

    const h = all[Math.floor(Math.random() * all.length)];
    const card = document.getElementById('random-card');
    card.dataset.loaded = '1';

    card.style.opacity = '0';
    setTimeout(() => {
      card.classList.toggle('is-bulbed', h.bulbed);
      card.innerHTML = `
        <div class="random-card-text">${this.escHtml(h.text)}</div>
        <div class="random-card-footer">
          <div class="random-card-book">
            <strong>${this.escHtml(h.bookTitle)}</strong>
            p. ${h.page}${h.date ? ' · ' + h.date : ''}
          </div>
          <div class="random-card-actions">
            <button class="action-btn bulb-btn${h.bulbed ? ' active' : ''}" title="Bulb" data-action="bulb" data-hid="${h.id}" data-bid="${h.bookId}">
              <svg viewBox="0 0 24 24" fill="${h.bulbed ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8">
                <path d="M9 21h6M12 3a6 6 0 014.472 10.05C15.97 13.56 15.5 14.8 15.5 16H8.5c0-1.2-.47-2.44-.972-2.95A6 6 0 0112 3z"/>
              </svg>
            </button>
            <button class="action-btn copy-btn" title="Copy" data-action="copy" data-text="${this.escAttr(h.text)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="bulb"]').addEventListener('click', () => {
        const newState = LuminoteStore.toggleBulb(h.bookId, h.id);
        h.bulbed = newState;
        card.classList.toggle('is-bulbed', newState);
        const btn = card.querySelector('.bulb-btn');
        btn.classList.toggle('active', newState);
        btn.querySelector('svg').setAttribute('fill', newState ? 'currentColor' : 'none');
        this.showToast(newState ? '⚡ Bulbed!' : 'Removed from bulbs');
        this.updateStats();
      });

      card.querySelector('[data-action="copy"]').addEventListener('click', (e) => {
        const text = e.currentTarget.dataset.text;
        navigator.clipboard.writeText(text).then(() => this.showToast('Copied!')).catch(() => {});
      });

      card.style.opacity = '1';
    }, 150);
  },

  // ── Settings ──────────────────────────────────────────────
  bindSettings() {
    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (confirm('Clear all books and highlights? This cannot be undone.')) {
        LuminoteStore.clearAll();
        this.renderHome();
        this.showToast('Library cleared');
      }
    });
  },

  // ── Utilities ─────────────────────────────────────────────
  updateStats() {
    const stats = LuminoteStore.getStats();
    const el = document.getElementById('stat-bulbs');
    if (el) el.textContent = stats.bulbed;
    const hEl = document.getElementById('stat-highlights');
    if (hEl) hEl.textContent = stats.highlights;
    const bEl = document.getElementById('stat-books');
    if (bEl) bEl.textContent = stats.books;
  },

  showToast(msg, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  },

  escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  escAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
