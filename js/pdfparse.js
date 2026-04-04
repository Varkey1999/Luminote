/**
 * pdfparse.js — Luminote
 * Parses Google Play Books highlight PDFs using pdf.js
 *
 * FORMAT (confirmed):
 *   Title / Author / Publisher / boilerplate / "All your annotations" / count / "Created by..."
 *   [Chapter heading — standalone line, no trailing page number]
 *   Highlight first-line ends with " <pageNum>"
 *   Continuation lines (no trailing number, not a date)
 *   Date line: "Month DD, YYYY"
 */

window.LuminotePDFParser = {

  async loadPDFJS() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve();
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  async parseFile(file) {
    await this.loadPDFJS();
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    const allLines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();

      // Group items by Y position to reconstruct lines
      const byY = {};
      for (const item of content.items) {
        if (!item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        if (!byY[y]) byY[y] = [];
        byY[y].push(item);
      }

      // Top-to-bottom order (descending Y in PDF coords)
      const ys = Object.keys(byY).map(Number).sort((a, b) => b - a);
      for (const y of ys) {
        const text = byY[y]
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map(it => it.str)
          .join(' ')
          .trim();
        if (text) allLines.push(text);
      }
    }

    return this.parseLines(allLines);
  },

  parseLines(lines) {
    const book = {
      id:             `book_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,
      title:          '',
      author:         '',
      publisher:      '',
      highlightCount: 0,
      lastSynced:     '',
      chapters:       [],
      highlights:     [],
      color:          '',
    };

    const SKIP_RE = /this document is overwritten|you should make a copy|all your annotations|\d+\s+notes\/highlights/i;
    const DATE_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;
    // A highlight's first line always ends with one or more digits (the page number)
    const FIRST_LINE_RE = /^(.+?)\s+(\d{1,4})$/;

    let i = 0;

    // ── 1. Extract title / author / publisher (first 3 real lines) ──
    const header = [];
    while (i < lines.length && header.length < 3) {
      const l = lines[i].trim();
      if (l && !SKIP_RE.test(l) && !DATE_RE.test(l)) {
        header.push(l);
      } else if (SKIP_RE.test(l)) {
        i++; break;
      }
      i++;
    }
    book.title     = header[0] || 'Unknown Title';
    book.author    = header[1] || '';
    book.publisher = header[2] || '';
    book.color     = this.generateColor(book.title);

    // ── 2. Skip boilerplate until past "Created by" ──────────
    while (i < lines.length) {
      const low = lines[i].toLowerCase();
      if (low.includes('created by')) {
        const m = lines[i].match(/last synced\s+(.+)/i);
        if (m) book.lastSynced = m[1].trim();
        i++; break;
      }
      if (SKIP_RE.test(lines[i])) { i++; continue; }
      i++;
    }

    // ── 3. Parse highlights ───────────────────────────────────
    const chapters  = [];
    let   currentChapter = 'General';
    const highlights     = [];

    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line)              { i++; continue; }
      if (SKIP_RE.test(line)) { i++; continue; }
      if (DATE_RE.test(line)) { i++; continue; }

      const m = line.match(FIRST_LINE_RE);

      if (m) {
        // ── Highlight block ──────────────────────────────────
        const firstText = m[1].trim();
        const pageNum   = m[2];
        const parts     = [firstText];
        let j = i + 1;

        while (j < lines.length) {
          const nxt = lines[j].trim();
          if (!nxt) { j++; continue; }
          if (DATE_RE.test(nxt))         break;  // date ends block
          if (nxt.match(FIRST_LINE_RE))  break;  // next highlight
          if (this.isChapterHeading(nxt, lines, j)) break;
          parts.push(nxt);
          j++;
        }

        let date = '';
        if (j < lines.length && DATE_RE.test(lines[j].trim())) {
          date = lines[j].trim();
          j++;
        }

        const text = parts.join(' ').trim();
        if (text.length > 5) {
          highlights.push({
            id:      `h_${highlights.length}_${Date.now()}`,
            text,
            page:    pageNum,
            date,
            chapter: currentChapter,
            bulbed:  false,
          });
        }
        i = j;
        continue;
      }

      // ── Chapter heading ──────────────────────────────────
      if (this.isChapterHeading(line, lines, i)) {
        currentChapter = line;
        if (!chapters.includes(currentChapter)) chapters.push(currentChapter);
        i++;
        continue;
      }

      i++;
    }

    book.chapters       = chapters;
    book.highlights     = highlights;
    book.highlightCount = highlights.length;
    return book;
  },

  /**
   * A chapter heading:
   *  - Does NOT end with a page number (that makes it a highlight line)
   *  - Is not a date
   *  - Is short enough to be a title
   *  - Starts with a known chapter-style keyword OR
   *    appears as a completely standalone line (no highlight follows on the same "block")
   *
   * Key fix: only treat colon-containing lines as headings if they appear
   * as the FIRST line of a block — i.e. NOT when they follow the middle of a highlight.
   */
  isChapterHeading(line, lines, idx) {
    const DATE_RE = /^(January|February|March|April|May|June|July|August|September|October|November|December)/;
    if (DATE_RE.test(line))              return false;
    if (/\s+\d{1,4}$/.test(line))       return false; // ends with page number → highlight
    if (line.length > 100 || line.length < 3) return false;

    // Strong positive signals: known chapter-level keywords at start
    if (/^(prologue|epilogue|introduction|chapter|part\s+\d|conclusion|appendix|preface|foreword|afterword|interlude)/i.test(line)) return true;

    // A colon-containing short line is a chapter heading ONLY if:
    // - the previous non-empty line was a date or a highlight (not a continuation)
    // This prevents mid-highlight lines with colons being misclassified
    if (line.includes(':') && line.length < 70) {
      const DATE_FULL = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/;
      // Look back at previous non-empty line
      let prev = '';
      for (let k = idx - 1; k >= 0; k--) {
        if (lines[k].trim()) { prev = lines[k].trim(); break; }
      }
      // Safe to call it a chapter only if previous line was a date or had a page number (end of highlight)
      if (DATE_FULL.test(prev) || /\s+\d{1,4}$/.test(prev)) return true;
      return false;
    }

    return false;
  },

  generateColor(title) {
    const palette = ['#e8f4f8','#f0e8f8','#f8f0e8','#e8f8ee','#f8e8e8','#f8f8e8','#e8eef8','#f0f8e8'];
    let hash = 0;
    for (const c of title) hash = c.charCodeAt(0) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  },
};
