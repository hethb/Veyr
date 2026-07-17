# Third-party attributions

Veyr incorporates ideas — and in places, a re-implementation in
TypeScript of the conversion behaviour — from the following open-source
projects. Their original licenses are preserved below.

---

## Microsoft MarkItDown

The Document → Markdown feature (`packages/proxy/src/conversion/` and the
**Documents** page in the dashboard) is directly inspired by Microsoft's
[MarkItDown](https://github.com/microsoft/markitdown) — a Python utility for
converting various file formats into Markdown for LLM consumption.

Veyr does NOT bundle the MarkItDown source. The conversion code is a
clean-room TypeScript reimplementation tailored to the formats Node.js can
handle without a Python runtime (HTML, CSV/TSV, JSON, XML, plain text, plus
PDF via `pdf-parse` and DOCX via `mammoth`). Behavioural choices that mirror
MarkItDown — preserving headings/lists/tables, page-boundary markers for
PDFs, dropping image data URIs from DOCX, etc. — are credited here.

MarkItDown's full license:

```
MIT License

 Copyright (c) Microsoft Corporation.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE
```

If you need the formats Veyr doesn't yet cover (PPTX, XLSX, EPUB,
audio/video, OCR), use the original MarkItDown directly — it's significantly
more complete in those areas.

---

## pdf-parse

PDF text extraction is delegated to [`pdf-parse`](https://www.npmjs.com/package/pdf-parse),
released under the MIT license.

## mammoth.js

DOCX → HTML conversion is delegated to [`mammoth`](https://github.com/mwilliamson/mammoth.js),
released under the BSD-2-Clause license.

## Landing page logo cloud (`packages/dashboard/public/logos/`)

- `infinite-slider.tsx` and `progressive-blur.tsx` under
  `packages/dashboard/src/components/ui/` are adapted from
  [Motion Primitives](https://github.com/ibelick/motion-primitives) by
  ibelick, MIT licensed.
- The Claude, OpenAI, Groq, Cursor, Gemini, and GitHub Copilot marks are
  SVG renderings sourced from [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons)
  (MIT-licensed wrapper). The `droid.svg` mark is Factory's official site
  favicon, fetched directly from factory.ai. Each mark remains the trademark
  of its respective owner (Anthropic, OpenAI, Groq, Cursor/Anysphere, Google,
  GitHub/Microsoft, Factory) and is used here only to indicate interoperability,
  per each brand's nominative-use allowances — not as an endorsement.
  Per Microsoft's VS Code brand guidelines, which disallow the icon in
  "works with" listings, VS Code is intentionally omitted from this row.
