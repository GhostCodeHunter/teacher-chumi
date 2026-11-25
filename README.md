# ടീച്ചർ.Chumi

Turn Excel sheets into neat, colourful PDF books for kids.

Upload an `.xlsx` or `.csv` file. Each sheet becomes a chapter. ടീച്ചർ.Chumi checks every page, sets the margins and padding, gives every number the same font, size and decimal style, and shows the whole book as real PDF pages before you download it.

## Features

- **Excel in, PDF out.** `.xlsx`, `.xlsm` and `.csv` files. Hidden sheets, rows and columns are skipped like in Excel.
- **Auto tidy.** Empty rows and columns are removed, header rows are found and repeated on each new page, one-cell rows become titles, small tables are kept on one page, and wide tables shrink a little, turn sideways (Auto orientation) or split into even parts.
- **Same style everywhere.** One text font, one number font, one text size for the whole book. Numbers in a column share the same decimals. Big numbers can use `1,234,567` or Indian `12,34,567` grouping.
- **Page sizes.** A4 by default, plus A5, A3, B5, Letter, Legal, Square and a custom size. Portrait, landscape or auto. Mirror margins for printed books.
- **Kids' templates.** Rainbow Fun, Party Balloons, Crayon Border, Sky & Clouds, Little Stars, Abacus Beads, Soft Bloom, Ribbon Band, Notebook, Classic Frame and Clean, with colour sets.
- **Your own designs.** Upload background pictures (all pages, cover only or inside pages) and add a text or logo watermark.
- **Cover and contents pages**, running headers and page numbers.
- **Malayalam text** is kept sharp in the PDF.
- **Private.** Everything runs in the browser. Files are never uploaded anywhere.

## Run it

It is a static website, no build step.

- **GitHub Pages:** push this folder to a repository, then *Settings → Pages → Deploy from a branch → `main` / root*.
- **On your computer:** the page uses JavaScript modules, so open it through a small local server instead of double-clicking `index.html`:

  ```bash
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

## Files

```
index.html          landing page + studio
css/style.css       all styles and animations
js/main.js          loader, page transitions, landing animations, router
js/studio.js        settings, upload, live preview, download
js/book-engine.js   layout engine that builds the PDF
js/templates.js     page designs
js/xlsx-reader.js   Excel / CSV reader
js/pdfview.js       PDF preview (pdf.js)
js/thumbs.js        template previews
js/sample.js        sample maths book
lib/                pdf-lib, pdf.js, JSZip (see lib/licenses)
```

## Libraries

- [pdf-lib](https://pdf-lib.js.org) (MIT) builds the PDF.
- [PDF.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) shows the preview.
- [JSZip](https://stuk.github.io/jszip/) (MIT) reads `.xlsx` files.
- Fonts: Baloo 2, Baloo Chettan 2 and Nunito from Google Fonts.
