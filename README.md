# CSV Modern Codeblock

CSV Modern Codeblock renders `csv` and `tsv` fenced code blocks as interactive tables inside Obsidian.


https://github.com/user-attachments/assets/cc8ba527-c131-4b5d-8d14-76721c56240d



This plugin was rewritten from scratch for modern table UX, stricter CSV handling, and better behavior with data-heavy notes. It was inspired by the original CSV Codeblock idea, but it is not a fork.

Repository:
https://github.com/vitovt/obsidian-csv-modern-codeblock

Original project that inspired the concept:
https://github.com/elrindir/obsidian-csv-codeblock

## Why This Plugin Exists

Markdown tables are tedious when the data is large, frequently edited, copied from spreadsheets, or full of long text. CSV and TSV are much easier to write, paste, diff, and maintain in source form. This plugin keeps that convenient source format while rendering it as a much more usable table in preview.

## Features

- Renders `csv` and `tsv` code blocks as tables directly in notes
- Uses the first row as the header by default
- Supports quoted fields, escaped quotes, quoted commas, multiline quoted cells, trailing empty cells, and CRLF line endings
- Auto-detects comma and semicolon delimiters for `csv` blocks
- Reports malformed CSV with a clear explanation that includes row, field, and line information
- Detects `http`, `https`, and `mailto` values and renders them as links
- Keeps header rows sticky by default
- Uses a vertically scrollable table area for tall datasets
- Adds a toolbar with optional view controls for sorting, per-column filtering, compact mode, zebra striping, and high-table mode
- Supports per-codeblock options for title, layout, filtering, sorting, links, delimiter selection, and height

## Performance And Implementation Improvements

Compared with the earlier plugin idea, this rewrite adds:

- A real CSV parser instead of splitting rows on delimiters
- Correct handling of escaped and quoted fields
- Delimiter autodetection for semicolon-separated CSV exports
- Stronger malformed-input validation instead of silently rendering broken tables
- Direct row rendering without building a separate full parsed matrix first
- Lower memory pressure for large tables
- A dedicated stylesheet for table presentation and theme integration

## Default Behavior

- The first row is treated as the header
- Sticky headers are enabled
- A base vertical scroll area is enabled
- Sorting is off until you press `Sorting`
- Per-column filtering is off until you press `Filtering`
- Compact mode is off until you press `Compact`
- Zebra striping is off until you press `Zebra`
- High-table mode is off until you press `High table`

## Basic Usage

````markdown
```csv
Name,Role,City
Alice,Researcher,Berlin
Bob,Editor,Paris
```
````

TSV works the same way:

````markdown
```tsv
Name	Role	City
Alice	Researcher	Berlin
Bob	Editor	Paris
```
````

## Toolbar Controls

Each rendered table includes a toolbar above it:

- `Sorting` enables sorting by clicking header cells
- `Filtering` shows a filter input under each header column
- `Compact` switches to fit-to-width mode
- `Zebra` toggles alternating row striping
- `High table` doubles the vertical scroll height

These controls change only the rendered view. They do not modify your source data.

## Codeblock Options

You can set per-table defaults directly on the opening fence line:

````markdown
```csv title:"Folktales" sort:true filter:true compact:true zebra:true high-table:true
Nr.;Titel;Quelle
1;Der Froschkönig;https://projekt-gutenberg.org/
```
````

Supported options:

- `title:"..."`
- `header:true|false`
- `sticky:true|false`
- `sort:true|false`
- `filter:true|false`
- `compact:true|false`
- `zebra:true|false`
- `high-table:true|false`
- `links:true|false`
- `delimiter:auto|comma|semicolon|tab`
- `max-height:<css-size>`

Examples:

- `delimiter:semicolon`
- `max-height:32rem`
- `compact:true`
- `filter:true`

## Submission And Privacy Disclosures

- No network requests
- No telemetry, analytics, ads, or tracking
- No accounts, subscriptions, or payments
- No external services
- No access to files outside normal Obsidian plugin execution and rendered note content
- Fully local behavior inside Obsidian
- Open source

## Inspiration

CSV Modern Codeblock was inspired by the original CSV Codeblock plugin:

https://github.com/elrindir/obsidian-csv-codeblock

This project is a separate rewrite with a new codebase, different implementation, added validation, performance-focused parsing changes, and expanded table functionality.

## License

MIT
