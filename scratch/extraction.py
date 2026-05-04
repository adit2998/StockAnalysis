import fitz
import re
import json
import sys


# TOC: item number appears alone on a line, e.g. "ITEM 1A."
_TOC_ITEM_LINE = re.compile(r'^(ITEM\s+\d+[A-Z]*)\.?\s*$', re.IGNORECASE | re.MULTILINE)
_TOC_PART_LINE = re.compile(r'^(PART\s+[IVX]+)\b', re.IGNORECASE | re.MULTILINE)
_PAGE_NUM_LINE = re.compile(r'^\d{1,4}$')


def open_document(filepath):
    return fitz.open(filepath)


def _stripped_lines(text):
    return [ln.strip() for ln in text.split('\n')]


def find_toc_page(document, max_scan=12):
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if len(_TOC_ITEM_LINE.findall(text)) >= 3:
            return pn
    return None


def parse_toc(document, toc_page):
    """
    Parse a multi-line TOC where entries look like:
        ITEM 1.
        BUSINESS
        5
    Returns list of dicts: {label, title, part, page_ref}
    """
    entries = []
    seen = set()
    current_part = None

    lines = _stripped_lines(document[toc_page].get_text())
    # Some TOCs span two pages; check the next page too
    next_page = toc_page + 1
    if next_page < len(document):
        extra = _stripped_lines(document[next_page].get_text())
        if len(_TOC_ITEM_LINE.findall(document[next_page].get_text())) >= 2:
            lines += extra

    i = 0
    while i < len(lines):
        line = lines[i]

        part_m = _TOC_PART_LINE.match(line)
        if part_m:
            current_part = re.sub(r'\s+', '_', part_m.group(0).upper().strip())
            i += 1
            continue

        item_m = _TOC_ITEM_LINE.match(line)
        if item_m:
            label = re.sub(r'\s+', '_', item_m.group(1).upper().strip())
            # Collect title lines until we hit a bare page number
            title_parts = []
            i += 1
            page_ref = None
            while i < len(lines):
                nxt = lines[i]
                if _PAGE_NUM_LINE.match(nxt):
                    page_ref = int(nxt)
                    i += 1
                    break
                if _TOC_ITEM_LINE.match(nxt) or _TOC_PART_LINE.match(nxt):
                    break
                if nxt:
                    title_parts.append(nxt)
                i += 1

            key = f"{current_part or ''}_{label}"
            if page_ref is not None and key not in seen:
                seen.add(key)
                entries.append({
                    'label': label,
                    'title': ' '.join(title_parts),
                    'part': current_part,
                    'page_ref': page_ref,
                })
            continue

        i += 1

    return sorted(entries, key=lambda e: e['page_ref'])


def resolve_pages(document, toc_entries, toc_page):
    """
    Sequential scan: find each section heading in document order, always
    resuming from the page where the previous section was found.
    This handles PDFs where printed page numbers don't map 1:1 to PDF pages.
    """
    total = len(document)
    resolved = []
    scan_from = toc_page + 1  # skip the TOC page itself

    for entry in toc_entries:
        label_bare = entry['label'].replace('_', ' ')
        label_re = re.compile(
            r'^' + re.escape(label_bare) + r'[.\s\xa0]',
            re.IGNORECASE,
        )
        found = None
        for pn in range(scan_from, total):
            for ln in document[pn].get_text().split('\n'):
                s = ln.strip()
                if label_re.match(s) and len(s) > len(label_bare) + 1:
                    found = pn
                    break
            if found is not None:
                break

        if found is None:
            found = scan_from
        else:
            scan_from = found  # next item must appear at or after this page

        resolved.append({**entry, 'start_page': found})

    # Assign end pages; always span at least 1 page so co-located sections
    # (two items on the same PDF page) still capture content.
    for i, e in enumerate(resolved):
        if i + 1 < len(resolved):
            e['end_page'] = max(e['start_page'] + 1, resolved[i + 1]['start_page'])
        else:
            e['end_page'] = total

    return resolved


def extract_text(document, start_page, end_page):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        chunks.append(document[pn].get_text())
    return '\n'.join(chunks).strip()


def build_output(resolved, document):
    return [
        {
            'title': entry['title'],
            'content': extract_text(document, entry['start_page'], entry['end_page']),
        }
        for entry in resolved
    ]


def extract_10k_sections(filepath):
    document = open_document(filepath)

    toc_page = find_toc_page(document)
    if toc_page is None:
        document.close()
        raise RuntimeError("Could not locate Table of Contents in the first 12 pages.")

    toc_entries = parse_toc(document, toc_page)
    if not toc_entries:
        document.close()
        raise RuntimeError("TOC page found but no entries parsed. Check PDF formatting.")

    resolved = resolve_pages(document, toc_entries, toc_page)
    output = build_output(resolved, document)
    document.close()
    return output


if __name__ == '__main__':
    filepath = sys.argv[1] if len(sys.argv) > 1 else 'aapl_10-K_report.pdf'
    sections = extract_10k_sections(filepath)
    print(json.dumps(sections, indent=2))
