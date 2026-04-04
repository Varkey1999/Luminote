# Luminote 📚

A beautiful PWA for reading and revisiting your Google Play Books highlights.

## Features

- 📖 **Library** — Upload Play Books highlight PDFs, view as a book gallery
- ⚡ **Bulb** — Mark your favourite highlights with a lightning bolt
- 📋 **Copy** — One-tap copy any highlight
- 🔗 **Jump** — Open in Play Books at the exact page
- 🗂️ **Stack** — All your bulbed highlights in one place
- 🎲 **Randomizer** — Surprise yourself with a random highlight
- 🔍 **Filters** — By chapter, date, length, or bulbed status

## How to use

1. In Google Play Books, open a book → Notes tab → Export to Google Drive
2. Download the PDF from Google Drive
3. Upload it to Luminote via the **+** button

## Deploy to GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages**
3. Set source to `main` branch, root folder
4. Your app will be live at `https://yourusername.github.io/luminote`

## Local development

```bash
# Serve locally (required for Service Worker)
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`

## Tech

- Vanilla JS, no framework
- pdf.js for PDF parsing
- localStorage for data persistence
- Full PWA with offline support

## Data & Privacy

All data stays on your device. Nothing is uploaded or sent anywhere.
