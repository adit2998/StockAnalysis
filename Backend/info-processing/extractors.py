import re
import gridfs
import pymongo
import fitz


# ── shared helpers ────────────────────────────────────────────────────────────

def _open_document_from_mongo(mongo_uri, db_name, filename):
    client = pymongo.MongoClient(mongo_uri)
    db = client[db_name]
    fs = gridfs.GridFS(db)
    pdf_file = fs.find_one({"filename": filename})
    if pdf_file is None:
        raise FileNotFoundError(f"File '{filename}' not found in GridFS.")
    pdf_data = pdf_file.read()
    return fitz.open(stream=pdf_data, filetype="pdf")


# ── 10-K / 10-Q extraction ────────────────────────────────────────────────────

_TOC_ITEM_LINE = re.compile(r'^(ITEM\s+\d+[A-Z]*)\.?\s*$', re.IGNORECASE | re.MULTILINE)
_TOC_PART_LINE = re.compile(r'^(PART\s+[IVX]+)\b', re.IGNORECASE | re.MULTILINE)
_PAGE_NUM_LINE = re.compile(r'^\d{1,4}$')


def _stripped_lines(text):
    return [ln.strip() for ln in text.split('\n')]


def _find_toc_page_10k(document, max_scan=12):
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if len(_TOC_ITEM_LINE.findall(text)) >= 3:
            return pn
    return None


def _parse_toc_10k(document, toc_page):
    entries = []
    seen = set()
    current_part = None

    lines = _stripped_lines(document[toc_page].get_text())
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


def _resolve_pages_10k(document, toc_entries, toc_page):
    total = len(document)
    resolved = []
    scan_from = toc_page + 1

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
            scan_from = found

        resolved.append({**entry, 'start_page': found})

    for i, e in enumerate(resolved):
        if i + 1 < len(resolved):
            e['end_page'] = max(e['start_page'] + 1, resolved[i + 1]['start_page'])
        else:
            e['end_page'] = total

    return resolved


def _extract_text(document, start_page, end_page):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        chunks.append(document[pn].get_text())
    return '\n'.join(chunks).strip()


def extract_from_10K_10Q(mongo_uri, db_name, ticker, filename):
    """
    Extract sections from a 10-K or 10-Q PDF stored in MongoDB GridFS.
    Returns a dict with 'ticker', 'file_name', and 'sections'.
    """
    document = _open_document_from_mongo(mongo_uri, db_name, filename)

    toc_page = _find_toc_page_10k(document)
    if toc_page is None:
        document.close()
        raise RuntimeError(f"Could not locate Table of Contents in '{filename}'.")

    toc_entries = _parse_toc_10k(document, toc_page)
    if not toc_entries:
        document.close()
        raise RuntimeError(f"TOC found but no entries parsed in '{filename}'.")

    resolved = _resolve_pages_10k(document, toc_entries, toc_page)

    sections = {
        entry['title']: _extract_text(document, entry['start_page'], entry['end_page'])
        for entry in resolved
    }

    document.close()
    return {
        'ticker': ticker,
        'file_name': filename,
        'sections': sections,
    }


# ── DEF 14A (proxy statement) extraction ─────────────────────────────────────

_PROXY_PAGENUM = re.compile(r'^\s*\d{1,3}\s*$')
_DASHES = re.compile(r'[–—‒―‐−]')
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


def _normalize(text):
    s = _DASHES.sub('-', text)
    s = re.sub(r'\s*-\s*', '-', s)
    return re.sub(r'\s+', ' ', s).strip().lower()


def _clean_page_text(text):
    lines = [ln for ln in text.split('\n') if not _ARTIFACT_LINE.search(ln)]
    return '\n'.join(lines)


def _make_heading_re(title):
    words = _normalize(title).split()
    prefix = re.escape(' '.join(words[:min(5, len(words))]))
    return re.compile(r'^' + prefix, re.IGNORECASE)


def _is_banner_fragment(text):
    words = text.strip().split()
    return (len(words) <= 2
            and text.strip() == text.strip().upper()
            and all(w.isalpha() for w in words))


def _find_toc_page_proxy(document, max_scan=30):
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if 'table of contents' not in text.lower():
            continue
        lines = text.split('\n')
        pagenum_count = sum(1 for ln in lines if _PROXY_PAGENUM.match(ln))
        if pagenum_count >= 5:
            return pn
    return None


def _parse_toc_proxy(document, toc_page):
    lines = document[toc_page].get_text().split('\n')
    next_page = toc_page + 1
    if next_page < len(document):
        next_lines = document[next_page].get_text().split('\n')
        if sum(1 for ln in next_lines if _PROXY_PAGENUM.match(ln)) >= 3:
            lines += next_lines

    entries = []
    seen = set()

    for i, line in enumerate(lines):
        if not _PROXY_PAGENUM.match(line):
            continue

        page_ref = int(line.strip())

        title_raw = ''
        title_idx = -1
        for j in range(i - 1, max(-1, i - 4), -1):
            s = lines[j].strip()
            if not s:
                continue
            if re.search(r'https?://|file://|Page \d+ of \d+', s):
                break
            if _PROXY_PAGENUM.match(lines[j]):
                break
            title_raw = lines[j]
            title_idx = j
            break

        if not title_raw.strip():
            continue

        title = title_raw.strip()
        if title.isdigit():
            continue

        if title_idx > 0:
            for j in range(title_idx - 1, max(-1, title_idx - 4), -1):
                s = lines[j].strip()
                if not s:
                    break
                if _PROXY_PAGENUM.match(lines[j]):
                    break
                if re.search(r'https?://|file://|Page \d+ of \d+', s):
                    break
                if _is_banner_fragment(s):
                    break
                title = s + ' ' + title
                break

        leading = len(title_raw) - len(title_raw.lstrip())
        if leading >= 1:
            indent = 1
        elif (title_idx > 0
              and not lines[title_idx - 1].strip()
              and len(lines[title_idx - 1]) >= 2
              and '\xa0' not in lines[title_idx - 1]):
            indent = 2
        else:
            indent = 0

        key = f"{title}:{page_ref}"
        if key not in seen:
            seen.add(key)
            entries.append({'title': title, 'page_ref': page_ref, 'indent': indent})

    return sorted(entries, key=lambda e: e['page_ref'])


def _resolve_pages_proxy(document, toc_entries, toc_page):
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

    for i, e in enumerate(resolved):
        if i + 1 < len(resolved):
            e['end_page'] = max(e['start_page'] + 1, resolved[i + 1]['start_page'])
        else:
            e['end_page'] = total

    return resolved


def _extract_text_proxy(document, start_page, end_page):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        chunks.append(_clean_page_text(document[pn].get_text()))
    return '\n'.join(chunks).strip()


def extract_from_DEF_14A(mongo_uri, db_name, ticker, filename, max_indent=1):
    """
    Extract sections from a DEF 14A proxy statement PDF stored in MongoDB GridFS.
    Returns a dict with 'ticker', 'file_name', and 'sections'.
    """
    document = _open_document_from_mongo(mongo_uri, db_name, filename)

    toc_page = _find_toc_page_proxy(document)
    if toc_page is None:
        document.close()
        raise RuntimeError(f"Could not locate Table of Contents in '{filename}'.")

    toc_entries = _parse_toc_proxy(document, toc_page)
    if not toc_entries:
        document.close()
        raise RuntimeError(f"TOC found but no entries parsed in '{filename}'.")

    filtered = [e for e in toc_entries if e['indent'] <= max_indent]
    if not filtered:
        filtered = toc_entries

    resolved = _resolve_pages_proxy(document, filtered, toc_page)

    sections = {
        entry['title']: _extract_text_proxy(document, entry['start_page'], entry['end_page'])
        for entry in resolved
    }

    document.close()
    return {
        'ticker': ticker,
        'file_name': filename,
        'sections': sections,
    }
