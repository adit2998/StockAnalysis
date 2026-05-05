import fitz
import re
import json
import sys


# Proxy TOC page numbers — matches both "   N  " (Apple) and bare "N" (Google)
_PROXY_PAGENUM = re.compile(r'^\s*\d{1,3}\s*$')

# Dash variants (em, en, figure, horizontal bar, minus-sign) → normalized
_DASHES = re.compile(r'[–—‒―‐−]')

# Lines that are PDF/HTML conversion artifacts appearing in every page header:
#   - file:// or https:// URLs (HTML source path or SEC EDGAR link)
#   - "Page N of M" page counters
#   - Date-time stamps like "5/4/26, 11:38 AM"
#   - "Table of Contents" repeated as a navigation link
#   - "Definitive/Preliminary Proxy Statement" or "COMPANY - DEF 14A" banners
_ARTIFACT_LINE = re.compile(
    r'https?://'
    r'|file://'
    r'|^\s*Page\s+\d+\s+of\s+\d+\s*$'
    r'|^\s*\d{1,2}/\d{1,2}/\d{2,4}[\s,]'
    r'|^\s*Table of Contents\s*$'
    r'|^\s*(Definitive|Preliminary)\s+Proxy\s+Statement\s*$'
    r'|\bDEF\s*14A\b',
    re.IGNORECASE,
)


def open_document(filepath):
    return fitz.open(filepath)


def _normalize(text):
    """Lower-case, unify dashes and surrounding spaces, collapse whitespace."""
    s = _DASHES.sub('-', text)
    s = re.sub(r'\s*-\s*', '-', s)  # "1 – Election" → "1-election"
    return re.sub(r'\s+', ' ', s).strip().lower()


def _clean_page_text(text):
    """Strip per-page header/footer artifacts introduced by HTML→PDF conversion."""
    lines = [ln for ln in text.split('\n') if not _ARTIFACT_LINE.search(ln)]
    return '\n'.join(lines)


def _make_heading_re(title):
    """Regex matching the first 5 words of a normalized title at line start."""
    words = _normalize(title).split()
    prefix = re.escape(' '.join(words[:min(5, len(words))]))
    return re.compile(r'^' + prefix, re.IGNORECASE)


def _is_banner_fragment(text):
    """True if text is a short all-caps word or two — a section-divider banner, not a title."""
    words = text.strip().split()
    return (len(words) <= 2
            and text.strip() == text.strip().upper()
            and all(w.isalpha() for w in words))


def find_toc_page(document, max_scan=30):
    """
    Find the Table of Contents page.
    Proxy TOCs are identified by:
      - 'table of contents' appearing in the page text
      - 5+ lines that are standalone page numbers
    """
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if 'table of contents' not in text.lower():
            continue
        lines = text.split('\n')
        pagenum_count = sum(1 for ln in lines if _PROXY_PAGENUM.match(ln))
        if pagenum_count >= 5:
            return pn
    return None


def parse_toc(document, toc_page):
    """
    Parse a proxy statement TOC where entries look like:
        Title Line
        N
    Returns list of dicts: {title, page_ref, indent}
    """
    lines = document[toc_page].get_text().split('\n')

    # Extend onto the next page if it continues the TOC
    next_page = toc_page + 1
    if next_page < len(document):
        next_text = document[next_page].get_text()
        next_lines = next_text.split('\n')
        if sum(1 for ln in next_lines if _PROXY_PAGENUM.match(ln)) >= 3:
            lines += next_lines

    entries = []
    seen = set()

    for i, line in enumerate(lines):
        if not _PROXY_PAGENUM.match(line):
            continue

        page_ref = int(line.strip())

        # Walk back to find the title: last non-empty, meaningful line before this one
        title_raw = ''
        title_idx = -1
        for j in range(i - 1, max(-1, i - 4), -1):
            s = lines[j].strip()
            if not s:
                continue
            if re.search(r'https?://|file://|Page \d+ of \d+', s):
                break
            if _PROXY_PAGENUM.match(lines[j]):
                break  # another page number → stop
            title_raw = lines[j]
            title_idx = j
            break

        if not title_raw.strip():
            continue

        title = title_raw.strip()

        # Skip bare-digit lines that are section-category markers (e.g. "1", "2", "3")
        if title.isdigit():
            continue

        # If the line directly above the title is NOT a page number and NOT a
        # section-banner fragment, the title is a word-wrap continuation of that
        # line — prepend it to reconstruct the full heading.
        if title_idx > 0:
            for j in range(title_idx - 1, max(-1, title_idx - 4), -1):
                s = lines[j].strip()
                if not s:
                    break  # blank separator → title is standalone
                if _PROXY_PAGENUM.match(lines[j]):
                    break  # previous entry's page number → standalone title
                if re.search(r'https?://|file://|Page \d+ of \d+', s):
                    break
                if _is_banner_fragment(s):
                    break  # short all-caps section-divider word → don't include
                title = s + ' ' + title  # prepend the continuation line
                break

        # Determine indent level from leading spaces on the raw title line.
        # Level-2 entries are preceded by a line of only ASCII spaces ("  ").
        # The TOC preamble uses \xa0 (non-breaking space) which looks blank
        # but belongs to level-0 entries — exclude it from the indent=2 check.
        leading = len(title_raw) - len(title_raw.lstrip())
        if leading >= 1:
            indent = 1
        elif (title_idx > 0
              and not lines[title_idx - 1].strip()
              and len(lines[title_idx - 1]) >= 2  # ≥2-char blank = real separator (not single-space preamble)
              and '\xa0' not in lines[title_idx - 1]):
            indent = 2
        else:
            indent = 0

        key = f"{title}:{page_ref}"
        if key not in seen:
            seen.add(key)
            entries.append({
                'title': title,
                'page_ref': page_ref,
                'indent': indent,
            })

    return sorted(entries, key=lambda e: e['page_ref'])


def resolve_pages(document, toc_entries, toc_page):
    """
    Sequential scan: find each section heading in document order.
    Resumes from the page where the previous section was found so that
    out-of-order printed page numbers don't confuse the search.
    """
    total = len(document)
    resolved = []
    scan_from = toc_page + 1

    for entry in toc_entries:
        heading_re = _make_heading_re(entry['title'])
        min_len = max(4, len(entry['title']) // 2)

        found = None
        for pn in range(scan_from, total):
            for ln in document[pn].get_text().split('\n'):
                s = ln.strip()
                if len(s) < min_len:
                    continue
                if heading_re.match(_normalize(s)):
                    found = pn
                    break
            if found is not None:
                break

        if found is None:
            found = scan_from
        else:
            scan_from = found

        resolved.append({**entry, 'start_page': found})

    # Assign end pages; guarantee at least 1 page per section
    for i, e in enumerate(resolved):
        if i + 1 < len(resolved):
            e['end_page'] = max(e['start_page'] + 1, resolved[i + 1]['start_page'])
        else:
            e['end_page'] = total

    return resolved


def extract_text(document, start_page, end_page):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        chunks.append(_clean_page_text(document[pn].get_text()))
    return '\n'.join(chunks).strip()


def build_output(resolved, document):
    return [
        {
            'title': entry['title'],
            'content': extract_text(document, entry['start_page'], entry['end_page']),
        }
        for entry in resolved
    ]


def extract_proxy_sections(filepath, max_indent=1):
    """
    Extract sections from a DEF 14A proxy statement PDF.

    max_indent controls nesting depth included in output:
      0 → top-level sections only
      1 → top-level + immediate sub-sections (default; includes individual proposals)
      2 → all levels including granular sub-sub-sections
    """
    document = open_document(filepath)

    toc_page = find_toc_page(document)
    if toc_page is None:
        document.close()
        raise RuntimeError("Could not locate Table of Contents in the first 30 pages.")

    toc_entries = parse_toc(document, toc_page)
    if not toc_entries:
        document.close()
        raise RuntimeError("TOC page found but no entries parsed. Check PDF formatting.")

    filtered = [e for e in toc_entries if e['indent'] <= max_indent]
    if not filtered:
        filtered = toc_entries  # fallback: keep all if filter removed everything

    resolved = resolve_pages(document, filtered, toc_page)
    output = build_output(resolved, document)
    document.close()
    return output


if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else 'Apple_proxy.pdf'
    sections = extract_proxy_sections(filepath)
    print(json.dumps(sections, indent=2))
