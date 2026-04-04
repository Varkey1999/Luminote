/**
 * pdfparse.js
 * Parses Google Play Books highlight PDFs using pdf.js
 * Loaded via CDN in app.js before use
 */

window.LuminotePDFParser = {

  /**
   * Load pdf.js dynamically
   */
  async loadPDFJS() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  },

  /**
   * Parse a Play Books PDF File object → book data structure
   */
  async parseFile(file) {
    await this.loadPDFJS();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const pageTexts = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      pageTexts.push(pageText);
      fullText += pageText + '\n---PAGEBREAK---\n';
    }

    return this.parsePlayBooksText(fullText, pageTexts);
  },

  /**
   * Core parser: extract book metadata + highlights from raw text
   */
  parsePlayBooksText(fullText, pageTexts) {
    const lines = fullText
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const book = {
      id: null,
      title: '',
      author: '',
      publisher: '',
      highlightCount: 0,
      lastSynced: '',
      chapters: [],
      highlights: [],
    };

    // ── Extract header metadata ──────────────────────────────
    // Title is usually the first meaningful line
    // Format: "Title\nAuthor\nPublisher\nThis document is overwritten..."
    let headerEndIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i];
      if (line.includes('This document is overwritten') || line.includes('All your annotations')) {
        headerEndIdx = i;
        break;
      }
    }

    // First three non-empty lines before the warning = title, author, publisher
    const headerLines = lines.slice(0, headerEndIdx).filter(l =>
      !l.includes('This document') && !l.includes('make a copy') && l.length > 1
    );

    if (headerLines[0]) book.title = headerLines[0];
    if (headerLines[1]) book.author = headerLines[1];
    if (headerLines[2]) book.publisher = headerLines[2];

    // Highlight count
    const countMatch = fullText.match(/(\d+)\s+notes\/highlights/);
    if (countMatch) book.highlightCount = parseInt(countMatch[1]);

    // Last synced
    const syncMatch = fullText.match(/Last synced\s+([A-Za-z]+\s+\d+,\s+\d+)/);
    if (syncMatch) book.lastSynced = syncMatch[1];

    // ── Parse highlights ─────────────────────────────────────
    // Strategy: rebuild from page texts, looking for the pattern:
    // [chapter heading (italic in source)] → [highlight text] [page number] [date]

    const highlights = [];
    const chapters = new Set();
    let currentChapter = 'General';

    // Date pattern: Month DD, YYYY
    const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;

    // Page number: standalone number (1-9999)
    const pagePattern = /^(\d{1,4})$/;

    // We flatten all text and work through it token by token
    // The PDF text extraction gives us items in visual order
    const allLines = fullText
      .replace(/---PAGEBREAK---/g, '')
      .split(/\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    let i = 0;
    while (i < allLines.length) {
      const line = allLines[i];

      // Skip boilerplate
      if (
        line.includes('This document is overwritten') ||
        line.includes('make a copy') ||
        line.includes('All your annotations') ||
        line.includes('notes/highlights') ||
        line.includes('Created by') ||
        line === book.title ||
        line === book.author ||
        line === book.publisher
      ) {
        i++;
        continue;
      }

      // Detect chapter headings:
      // In Play Books PDFs they appear as standalone lines that are NOT
      // dates, NOT pure numbers, and come between highlight blocks.
      // They often look like "Prologue: Title" or "Chapter 1: Title"
      if (this.isChapterHeading(line, allLines, i)) {
        currentChapter = line;
        if (!chapters.has(currentChapter)) {
          chapters.add(currentChapter);
          book.chapters.push(currentChapter);
        }
        i++;
        continue;
      }

      // Look for a highlight block:
      // Collect consecutive non-date, non-page lines as the highlight text
      // then expect a page number, then a date
      if (this.looksLikeHighlightStart(line)) {
        let textLines = [line];
        let j = i + 1;

        // Accumulate until we hit a date or a lone page number followed by date
        while (j < allLines.length) {
          const next = allLines[j];

          // If we see a page number followed by a date, we're done with text
          if (pagePattern.test(next)) {
            const afterPage = allLines[j + 1] || '';
            if (datePattern.test(afterPage) || afterPage === '') {
              break;
            }
          }

          if (datePattern.test(next)) break;

          // Stop if we hit another chapter heading
          if (this.isChapterHeading(next, allLines, j)) break;

          textLines.push(next);
          j++;
        }

        // Now j should be at the page number
        let pageNum = null;
        let highlightDate = null;

        if (j < allLines.length && pagePattern.test(allLines[j])) {
          pageNum = allLines[j];
          j++;
        }

        if (j < allLines.length && datePattern.test(allLines[j])) {
          highlightDate = allLines[j];
          j++;
        }

        const text = textLines.join(' ').trim();

        // Filter out garbage (too short, or is metadata)
        if (text.length > 10 && pageNum) {
          highlights.push({
            id: `h_${highlights.length}_${Date.now()}`,
            text,
            page: pageNum,
            date: highlightDate || '',
            chapter: currentChapter,
            bulbed: false,
          });
        }

        i = j;
        continue;
      }

      i++;
    }

    book.highlights = highlights;
    book.id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Generate a colour for the book cover
    book.color = this.generateColor(book.title);

    return book;
  },

  isChapterHeading(line, lines, idx) {
    // Chapter headings in Play Books PDFs:
    // - Not a date
    // - Not a standalone number
    // - Not too long (> 120 chars usually means it's highlight text)
    // - Appears as a lone line with no page-number companion nearby
    // - Usually title-cased or contains a colon

    const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)/;
    const pagePattern = /^\d{1,4}$/;

    if (datePattern.test(line)) return false;
    if (pagePattern.test(line)) return false;
    if (line.length > 150) return false;
    if (line.length < 3) return false;

    // Check if line is followed by highlight text pattern (not a date/page immediately)
    const next = lines[idx + 1] || '';
    const nextNext = lines[idx + 2] || '';

    // If it looks like standalone heading before a block of highlight content
    // Chapter headings in Play Books are often italic (we can't detect italic from text,
    // but they tend to follow the pattern of being between highlight blocks)
    const chapterKeywords = /^(prologue|epilogue|introduction|chapter|part\s+\d|conclusion|appendix|preface|foreword|afterword|interlude)/i;
    if (chapterKeywords.test(line)) return true;

    // Lines with colons that aren't too long tend to be chapter headings
    if (line.includes(':') && line.length < 80 && !line.includes('.') && !pagePattern.test(next)) {
      // Make sure it's not a highlight
      if (!datePattern.test(next) && !pagePattern.test(next)) return true;
      if (pagePattern.test(next) && datePattern.test(nextNext)) return false; // it's a highlight
      return true;
    }

    return false;
  },

  looksLikeHighlightStart(line) {
    const datePattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)/;
    const pagePattern = /^\d{1,4}$/;
    if (datePattern.test(line)) return false;
    if (pagePattern.test(line)) return false;
    if (line.length < 8) return false;
    return true;
  },

  generateColor(title) {
    const colors = [
      '#e8f4f8', '#f0e8f8', '#f8f0e8', '#e8f8ee',
      '#f8e8e8', '#f8f8e8', '#e8eef8', '#f0f8e8'
    ];
    let hash = 0;
    for (let c of title) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  },

  /**
   * Build a Google Play Books deep link for a given page
   * Format observed: just page numbers in the PDF, no direct URL in text
   * We construct the best available link
   */
  buildPageLink(bookTitle, pageNum) {
    // Play Books doesn't have a stable public deep-link format for specific pages
    // The best we can do is a search link
    const query = encodeURIComponent(`${bookTitle} page ${pageNum}`);
    return `https://play.google.com/books/search?q=${query}`;
  }
};
