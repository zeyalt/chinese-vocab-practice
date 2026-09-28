# 华文生词练习 · 生词夜空

Browser-based Chinese vocabulary practice for **Primary 2 Higher Chinese** (Singapore). Single-page app: no install, no backend. Progress (accuracy and wrong answers) is stored in your browser via `localStorage`.

## Question types

- 拼音选择 / 看拼音选字 / 字词（成语）填空
- 字辨 / 词语搭配
- 组词成句 / 完成句子
- **短文填空** — short passage with a word bank (Berries-style)

## Sources and credit

This project is for **personal / family study only**. It is **not** affiliated with MOE, Berries World of Learning, or CLS International.

Practice content is **original or transcribed** for this app. Formats and vocabulary are aligned with:

- **Berries 百力果** consolidation-style worksheets (reference scans in this folder; **PDFs are not redistributed**).
- **小学高级华文 2A 模拟考试** (`P2-华文模拟考试.pdf` in this folder for private reference).

**© Berries / CLS International (1993) Pte Ltd** — all rights in the original worksheet and assessment materials belong to the respective publishers. This repository does not include those materials as downloadable copies for the public; only the practice app and its data files.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
cd chinese-vocab-practice
python3 -m http.server 8080
```

Then visit `http://localhost:8080/`.

## Project layout

| File | Role |
|------|------|
| `index.html` | App shell and styles |
| `app.js` | Logic and question rendering |
| `data/vocab.js` | Core word list, idioms, sentence patterns |
| `data/extras.js` | Extra words from Berries / mock exam + generated sentences |
| `data/zibian.js`, `data/dapei.js` | Character discrimination and collocations |
| `data/completions.js` | Clause-matching 完成句子 |
| `data/passages.js` | 短文填空 passages |
| `data/load.js` | Merges extras into pools |

Legacy single-file version: `vocab-practice.html` (superseded by `index.html`).

## GitHub Pages (optional)

When ready: push to GitHub, enable Pages from the `main` branch root, use `index.html` as the entry point.
