/**
 * store.js
 * Simple localStorage wrapper for Luminote data
 */

window.LuminoteStore = {
  BOOKS_KEY: 'luminote_books',

  getBooks() {
    try {
      return JSON.parse(localStorage.getItem(this.BOOKS_KEY) || '[]');
    } catch { return []; }
  },

  saveBooks(books) {
    localStorage.setItem(this.BOOKS_KEY, JSON.stringify(books));
  },

  addBook(book) {
    const books = this.getBooks();
    // Avoid duplicates by title+author
    const exists = books.find(b => b.title === book.title && b.author === book.author);
    if (exists) return { added: false, book: exists };
    books.unshift(book);
    this.saveBooks(books);
    return { added: true, book };
  },

  removeBook(bookId) {
    const books = this.getBooks().filter(b => b.id !== bookId);
    this.saveBooks(books);
  },

  toggleBulb(bookId, highlightId) {
    const books = this.getBooks();
    const book = books.find(b => b.id === bookId);
    if (!book) return false;
    const h = book.highlights.find(h => h.id === highlightId);
    if (!h) return false;
    h.bulbed = !h.bulbed;
    this.saveBooks(books);
    return h.bulbed;
  },

  getAllBulbed() {
    const books = this.getBooks();
    const bulbed = [];
    for (const book of books) {
      for (const h of book.highlights) {
        if (h.bulbed) bulbed.push({ ...h, bookTitle: book.title, bookAuthor: book.author, bookId: book.id });
      }
    }
    return bulbed;
  },

  getAllHighlights() {
    const books = this.getBooks();
    const all = [];
    for (const book of books) {
      for (const h of book.highlights) {
        all.push({ ...h, bookTitle: book.title, bookAuthor: book.author, bookId: book.id });
      }
    }
    return all;
  },

  clearAll() {
    localStorage.removeItem(this.BOOKS_KEY);
  },

  getStats() {
    const books = this.getBooks();
    let totalHighlights = 0;
    let totalBulbed = 0;
    for (const b of books) {
      totalHighlights += b.highlights.length;
      totalBulbed += b.highlights.filter(h => h.bulbed).length;
    }
    return { books: books.length, highlights: totalHighlights, bulbed: totalBulbed };
  }
};
