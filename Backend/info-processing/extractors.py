import re
import gridfs
import pymongo
import fitz
from collections import Counter


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


def _stripped_lines(text):
    return [ln.strip() for ln in text.split('\n')]


# ── 10-K / 10-Q patterns ─────────────────────────────────────────────────────

_TOC_ITEM_STANDALONE = re.compile(
    r'^(ITEM\s+\d+[A-Z]*)\.?\s*$', re.IGNORECASE | re.MULTILINE
)
_TOC_ITEM_INLINE = re.compile(
    r'^(ITEM\s+\d+[A-Z]*)\.?\s{1,10}(\S.*)$', re.IGNORECASE
)
_TOC_PART_LINE = re.compile(r'^(PART\s+[IVX]+)\b', re.IGNORECASE | re.MULTILINE)
_PAGE_NUM_LINE = re.compile(r'^\d{1,4}$')

_10K_ARTIFACT_LINE = re.compile(
    r'^\s*Table of Contents\s*$'
    r'|\|\s*\d{4}\s*Form\s+10-[KQq]'
    r'|^\s*Form\s+10-[KQq]\s*$'
    r'|^\s*Annual\s+Report\s+on\s+Form\s+10-[KQq]\s*$'
    r'|^\s*\d{1,2}/\d{1,2}/\d{2,4}[\s,]',
    re.IGNORECASE,
)


# ── 10-K / 10-Q helpers ───────────────────────────────────────────────────────

def _detect_recurring_headers(document, scan_pages=30, threshold=0.4):
    """Detect company-specific header lines (e.g. 'Alphabet Inc.') by frequency."""
    n = min(scan_pages, len(document))
    counts = Counter()
    for pn in range(n):
        lines = [l.strip() for l in document[pn].get_text().split('\n') if l.strip()]
        for ln in lines[:3]:
            if 0 < len(ln) < 60:
                counts[ln] += 1
    cutoff = max(3, int(n * threshold))
    return {ln for ln, cnt in counts.items() if cnt >= cutoff}


def _clean_10k_page_text(text, extra_strip=frozenset()):
    """Strip artifact lines and recurring headers; preserve Strategy C bare numbers."""
    prev_meaningful = ''
    out = []
    for ln in text.split('\n'):
        s = ln.strip()
        if _10K_ARTIFACT_LINE.search(ln):
            continue
        if s in extra_strip:
            continue
        # Bare page numbers — but NOT when preceded by "ITEM" (Strategy C)
        if re.match(r'^\d{1,4}[A-Z]?\.?\s*$', s) and s:
            if not re.match(r'^ITEM\s*$', prev_meaningful, re.IGNORECASE):
                continue
        if s:
            prev_meaningful = s
        out.append(ln)
    return '\n'.join(out)


def _trim_to_heading(page_text, label_bare):
    """
    Return page_text starting from the section heading line.
    Handles inline, two-line, and split-label layouts.
    Returns None if heading not found on this page.
    """
    label_num = re.sub(r'^ITEM\s+', '', label_bare, flags=re.IGNORECASE).strip()

    inline_re = re.compile(r'^' + re.escape(label_bare) + r'[.\s\xa0]', re.IGNORECASE)
    alone_re  = re.compile(r'^' + re.escape(label_bare) + r'\s*\.?\s*$', re.IGNORECASE)
    item_re   = re.compile(r'^ITEM\s*$', re.IGNORECASE)
    num_re    = re.compile(r'^' + re.escape(label_num)  + r'\s*\.?\s*$', re.IGNORECASE)

    lines = page_text.split('\n')
    offset = 0
    for i, ln in enumerate(lines):
        s = ln.strip()
        if inline_re.match(s) and len(s) > len(label_bare) + 1:
            return page_text[offset:]
        if alone_re.match(s):
            return page_text[offset:]
        if item_re.match(s):
            for j in range(i + 1, min(i + 3, len(lines))):
                if lines[j].strip() and num_re.match(lines[j].strip()):
                    return page_text[offset:]
                if lines[j].strip():
                    break
        offset += len(ln) + 1

    return None


def _title_keywords(title):
    return [w for w in re.split(r'\W+', title.upper()) if len(w) > 3]


def _find_toc_page_10k(document, max_scan=15):
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if len(_TOC_ITEM_STANDALONE.findall(text)) >= 3:
            return pn
        inline_hits = sum(
            1 for ln in text.split('\n')
            if _TOC_ITEM_INLINE.match(ln.strip())
        )
        if inline_hits >= 3:
            return pn
    return None


def _parse_toc_10k(document, toc_page):
    """
    Parse TOC entries for two layouts:
    Layout A – item and title on separate lines (Google, Apple standalone)
    Layout B – item and title on the same line (inline format)
    """
    entries = []
    seen = set()
    current_part = None

    lines = _stripped_lines(document[toc_page].get_text())

    for extra_pn in range(toc_page + 1, min(toc_page + 3, len(document))):
        extra_text = document[extra_pn].get_text()
        if len(_TOC_ITEM_STANDALONE.findall(extra_text)) >= 2:
            lines += _stripped_lines(extra_text)
            break

    i = 0
    while i < len(lines):
        line = lines[i]

        part_m = _TOC_PART_LINE.match(line)
        if part_m:
            current_part = re.sub(r'\s+', '_', part_m.group(0).upper().strip())
            i += 1
            continue

        # Layout B: "Item 1. Business   4"
        inline_m = _TOC_ITEM_INLINE.match(line)
        if inline_m:
            label = re.sub(r'\s+', '_', inline_m.group(1).upper().strip())
            remainder = inline_m.group(2).strip()

            end_page_m = re.search(r'\s+(\d{1,4})\s*$', remainder)
            if end_page_m:
                title = remainder[:end_page_m.start()].strip().rstrip('.')
                page_ref = int(end_page_m.group(1))
            else:
                title = remainder.rstrip('.')
                page_ref = None
                if i + 1 < len(lines) and _PAGE_NUM_LINE.match(lines[i + 1]):
                    page_ref = int(lines[i + 1])
                    i += 1
                elif (i + 1 < len(lines) and lines[i + 1]
                      and not _TOC_ITEM_STANDALONE.match(lines[i + 1])
                      and not _TOC_ITEM_INLINE.match(lines[i + 1])):
                    title = title + ' ' + lines[i + 1]
                    i += 1
                    if i + 1 < len(lines) and _PAGE_NUM_LINE.match(lines[i + 1]):
                        page_ref = int(lines[i + 1])
                        i += 1

            key = f"{current_part or ''}_{label}"
            if page_ref is not None and key not in seen:
                seen.add(key)
                entries.append({
                    'label': label,
                    'title': title,
                    'part': current_part,
                    'page_ref': page_ref,
                })
            i += 1
            continue

        # Layout A: "ITEM 1." alone, then title line(s), then page number
        item_m = _TOC_ITEM_STANDALONE.match(line)
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
                if (_TOC_ITEM_STANDALONE.match(nxt) or
                        _TOC_ITEM_INLINE.match(nxt) or
                        _TOC_PART_LINE.match(nxt)):
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


def _find_section_page(document, entry, scan_from, total):
    """
    Find the PDF page where a 10-K section heading appears.
    Three strategies: A (inline), B (two-line), C (split label across lines).
    """
    label_bare = entry['label'].replace('_', ' ')
    label_num = re.sub(r'^ITEM\s+', '', label_bare, flags=re.IGNORECASE).strip()
    keywords = _title_keywords(entry['title'])

    inline_re    = re.compile(r'^' + re.escape(label_bare) + r'[.\s\xa0]', re.IGNORECASE)
    alone_re     = re.compile(r'^' + re.escape(label_bare) + r'\s*\.?\s*$', re.IGNORECASE)
    item_word_re = re.compile(r'^ITEM\s*$', re.IGNORECASE)
    num_only_re  = re.compile(r'^' + re.escape(label_num) + r'\s*\.?\s*$', re.IGNORECASE)

    def _title_line_matches(text):
        if not text:
            return False
        normed = re.sub(r'\W+', ' ', text.upper()).strip()
        if keywords:
            hits = sum(1 for kw in keywords if kw in normed)
            return hits >= max(1, len(keywords) // 2)
        return len(text) < 80 and text.strip() == text.strip().upper()

    def _check_ahead(lines, start_idx, page_num, num_lines):
        for j in range(start_idx, min(start_idx + 5, num_lines)):
            nxt = lines[j].strip()
            if not nxt:
                continue
            if _title_line_matches(nxt):
                return page_num
            break
        if start_idx >= num_lines - 5 and page_num + 1 < total:
            for nxt_ln in document[page_num + 1].get_text().split('\n')[:6]:
                nxt = nxt_ln.strip()
                if not nxt:
                    continue
                if _title_line_matches(nxt):
                    return page_num
                break
        return None

    for pn in range(scan_from, total):
        lines = document[pn].get_text().split('\n')
        n = len(lines)

        for i, ln in enumerate(lines):
            s = ln.strip()
            if not s:
                continue

            if inline_re.match(s) and len(s) > len(label_bare) + 1:
                return pn

            if alone_re.match(s):
                result = _check_ahead(lines, i + 1, pn, n)
                if result is not None:
                    return result

            if item_word_re.match(s):
                for j in range(i + 1, min(i + 3, n)):
                    nxt = lines[j].strip()
                    if not nxt:
                        continue
                    if num_only_re.match(nxt):
                        result = _check_ahead(lines, j + 1, pn, n)
                        if result is not None:
                            return result
                    break

    return None


def _resolve_pages_10k(document, toc_entries, toc_page):
    total = len(document)
    resolved = []
    scan_from = toc_page + 1

    for entry in toc_entries:
        found = _find_section_page(document, entry, scan_from, total)
        was_found = found is not None

        if was_found:
            scan_from = found
        else:
            found = scan_from  # fallback; scan_from does not advance

        resolved.append({**entry, 'start_page': found, 'heading_found': was_found})

    for i, e in enumerate(resolved):
        if i + 1 < len(resolved):
            e['end_page'] = max(e['start_page'] + 1, resolved[i + 1]['start_page'])
        else:
            e['end_page'] = total

    return resolved


def _extract_10k_text(document, start_page, end_page, label_bare=None,
                      heading_found=True, extra_strip=frozenset()):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        raw = document[pn].get_text()
        if pn == start_page and label_bare:
            # Trim on raw text so Strategy C can see "5." before cleaning
            trimmed = _trim_to_heading(raw, label_bare)
            if trimmed is None:
                if not heading_found:
                    continue
                trimmed = raw
            raw = trimmed
        chunks.append(_clean_10k_page_text(raw, extra_strip))
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

    extra_strip = _detect_recurring_headers(document)
    resolved = _resolve_pages_10k(document, toc_entries, toc_page)

    sections = {
        entry['title']: _extract_10k_text(
            document,
            entry['start_page'],
            entry['end_page'],
            label_bare=entry['label'].replace('_', ' '),
            heading_found=entry.get('heading_found', True),
            extra_strip=extra_strip,
        )
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
_PROXY_INLINE_TOC = re.compile(r'^(\s*)(.{3,}?)(?:\.{3,}|\s{3,})\s*(\d{1,3})\s*$')
_PROXY_ARTIFACT_LINE = re.compile(
    r'https?://'
    r'|file://'
    r'|^\s*Page\s+\d+\s+of\s+\d+\s*$'
    r'|^\s*\d{1,2}/\d{1,2}/\d{2,4}[\s,]'
    r'|^\s*Table of Contents\s*$'
    r'|^\s*Back\s+to\s+(contents?|top)\s*$'
    r'|NOTICE OF\s+(ANNUAL\s+)?MEETING AND PROXY STATEMENT'
    r'|^\s*\d{4}\s+PROXY STATEMENT\s*$'
    r'|^\s*(Definitive|Preliminary)\s+Proxy\s+Statement\s*$'
    r'|\bDEF\s*14A\b'
    r'|\(continued\)\s*$',
    re.IGNORECASE,
)
_PROXY_TITLE_PAGE_PREFIX = re.compile(r'^\s*Page\s+', re.IGNORECASE)
_PROXY_NAV_DIGIT = re.compile(r'^\s*[1-9]\s*$')


def _normalize(text):
    s = _DASHES.sub('-', text)
    s = re.sub(r'\s*-\s*', '-', s)
    return re.sub(r'\s+', ' ', s).strip().lower()


def _strip_proxy_sidebar_nav(lines):
    """Remove leading sidebar nav block; stops when a blank is not followed by a digit."""
    if sum(1 for ln in lines[:30] if _PROXY_NAV_DIGIT.match(ln)) < 3:
        return lines
    i = 0
    while i < len(lines):
        if _PROXY_NAV_DIGIT.match(lines[i]):
            i += 1
            continue
        s = lines[i].strip()
        if not s:
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and _PROXY_NAV_DIGIT.match(lines[j]):
                i += 1
            else:
                break
            continue
        if len(s.split()) <= 3 and len(s) <= 25:
            i += 1
        else:
            break
    return lines[i:]


def _clean_proxy_page_text(text):
    lines = [ln for ln in text.split('\n') if not _PROXY_ARTIFACT_LINE.search(ln)]
    lines = _strip_proxy_sidebar_nav(lines)
    return '\n'.join(lines)


def _make_heading_re(title):
    words = _normalize(title).split()
    prefix = re.escape(' '.join(words[:min(4, len(words))]))
    return re.compile(r'^' + prefix, re.IGNORECASE)


def _is_banner_fragment(text):
    words = text.strip().split()
    return (len(words) <= 2
            and text.strip() == text.strip().upper()
            and all(w.isalpha() for w in words))


def _proxy_scan_for_heading(document, heading_re, start, end):
    for pn in range(max(0, start), min(end, len(document))):
        for ln in document[pn].get_text().split('\n'):
            s = ln.strip()
            if s and heading_re.match(_normalize(s)):
                return pn
    return None


def _count_proxy_toc_entries(lines):
    standalone = sum(1 for ln in lines if _PROXY_PAGENUM.match(ln))
    inline = sum(1 for ln in lines if _PROXY_INLINE_TOC.match(ln))
    return standalone, inline


def _proxy_toc_link_count(page):
    return sum(1 for lk in page.get_links()
               if lk.get('kind') == 4 and lk.get('page') is not None)


def _find_toc_page_proxy(document, max_scan=50):
    for pn in range(min(max_scan, len(document))):
        text = document[pn].get_text()
        if 'table of contents' not in text.lower():
            continue
        lines = text.split('\n')
        sa, il = _count_proxy_toc_entries(lines)
        if sa >= 5 or il >= 5:
            return pn
        if _proxy_toc_link_count(document[pn]) >= 5:
            return pn
        for lookahead in range(pn + 1, min(pn + 4, len(document))):
            next_lines = document[lookahead].get_text().split('\n')
            sa2, il2 = _count_proxy_toc_entries(next_lines)
            if sa2 >= 5 or il2 >= 5:
                return lookahead
            if _proxy_toc_link_count(document[lookahead]) >= 5:
                return lookahead
    return None


def _parse_proxy_toc_from_links(document, toc_page):
    """Parse TOC from internal PDF hyperlinks. Returns (entries, last_toc_page)."""
    entries = []
    seen = set()
    last_toc_page = toc_page

    toc_pages = [toc_page]
    collected = {lk['page'] for lk in document[toc_page].get_links()
                 if lk.get('kind') == 4 and lk.get('page') is not None}

    pn = toc_page + 1
    while pn < min(toc_page + 6, len(document)):
        page_links = [lk for lk in document[pn].get_links()
                      if lk.get('kind') == 4 and lk.get('page') is not None]
        novel = {lk['page'] for lk in page_links} - collected - {toc_page, pn}
        if len(novel) >= 3:
            toc_pages.append(pn)
            collected |= novel
            last_toc_page = pn
            pn += 1
        else:
            break

    for scan_pn in toc_pages:
        page = document[scan_pn]
        text_blocks = []
        for bx0, by0, bx1, by1, btext, *_ in page.get_text("blocks"):
            t = btext.strip().replace('\n', ' ')
            if t:
                text_blocks.append((by0, by1, bx0, t))

        for link in page.get_links():
            if link.get('kind') != 4:
                continue
            target_page = link.get('page')
            if target_page is None or target_page <= last_toc_page:
                continue

            lr = link['from']
            ly0, ly1, lx0 = lr.y0, lr.y1, lr.x0
            matched = [t for (by0, by1, bx0, t) in text_blocks
                       if ly0 - 2 <= (by0 + by1) / 2 <= ly1 + 2]
            title = ' '.join(matched).strip()
            if not title or title.isdigit():
                continue

            indent = 1 if lx0 >= 75 else 0
            key = f"{title}:{target_page}"
            if key not in seen:
                seen.add(key)
                entries.append({'title': title, 'page_ref': target_page,
                                'indent': indent, 'already_resolved': True})

    return sorted(entries, key=lambda e: e['page_ref']), last_toc_page


def _parse_toc_proxy(document, toc_page):
    """Returns (entries, last_toc_page).

    Tries three formats: link-based, inline text, standalone text.
    """
    if _proxy_toc_link_count(document[toc_page]) >= 5:
        entries, last_toc_page = _parse_proxy_toc_from_links(document, toc_page)
        if entries:
            return entries, last_toc_page

    lines = document[toc_page].get_text().split('\n')

    last_toc_page = toc_page
    pn = toc_page + 1
    while pn < len(document):
        next_lines = document[pn].get_text().split('\n')
        sa, il = _count_proxy_toc_entries(next_lines)
        if sa >= 3 or il >= 3:
            lines += next_lines
            last_toc_page = pn
            pn += 1
        else:
            break

    entries = []
    seen = set()

    standalone_count, inline_count = _count_proxy_toc_entries(lines)

    if inline_count > standalone_count:
        # Inline format: "Title text............45" or "Title text     45"
        for line in lines:
            m = _PROXY_INLINE_TOC.match(line)
            if not m:
                continue
            leading = len(m.group(1))
            title = m.group(2).strip().rstrip('.').strip()
            page_ref = int(m.group(3))
            if not title or title.isdigit():
                continue
            indent = 1 if leading >= 1 else 0
            key = f"{title}:{page_ref}"
            if key not in seen:
                seen.add(key)
                entries.append({'title': title, 'page_ref': page_ref, 'indent': indent})
    else:
        # Standalone format: page num on its own line, title on preceding line
        for idx, line in enumerate(lines):
            if not _PROXY_PAGENUM.match(line):
                continue

            page_ref = int(line.strip())

            title_raw = ''
            title_idx = -1
            for j in range(idx - 1, max(-1, idx - 4), -1):
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

            title = _PROXY_TITLE_PAGE_PREFIX.sub('', title).strip()
            if not title:
                continue

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

    return sorted(entries, key=lambda e: e['page_ref']), last_toc_page


def _resolve_pages_proxy(document, toc_entries, toc_page, last_toc_page):
    total = len(document)
    if not toc_entries:
        return []

    resolved = []

    if toc_entries[0].get('already_resolved'):
        for entry in toc_entries:
            resolved.append({**entry, 'start_page': entry['page_ref']})
    else:
        first_ref = toc_entries[0]['page_ref']
        page_offset = (last_toc_page + 1) - first_ref
        scan_from = last_toc_page + 1

        for entry in toc_entries:
            heading_re = _make_heading_re(entry['title'])
            estimated = page_offset + entry['page_ref']

            found = _proxy_scan_for_heading(document, heading_re,
                                            max(scan_from, estimated - 3), estimated + 8)
            if found is None:
                found = _proxy_scan_for_heading(document, heading_re, scan_from, total)

            pre_toc_found = None
            if found is None and estimated < toc_page:
                pre_toc_found = _proxy_scan_for_heading(document, heading_re, 0, toc_page)
                found = pre_toc_found

            if found is not None and pre_toc_found is None:
                scan_from = found
                page_offset = found - entry['page_ref']
            elif found is None:
                found = max(scan_from, min(estimated, total - 1))

            resolved.append({**entry, 'start_page': found})

    for i, e in enumerate(resolved):
        next_boundary = None
        for j in range(i + 1, len(resolved)):
            if resolved[j]['indent'] <= e['indent']:
                next_boundary = resolved[j]['start_page']
                break
        e['end_page'] = max(e['start_page'] + 1,
                            next_boundary if next_boundary is not None else total)

    return resolved


def _extract_text_proxy(document, start_page, end_page):
    chunks = []
    for pn in range(start_page, min(end_page, len(document))):
        chunks.append(_clean_proxy_page_text(document[pn].get_text()))
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

    toc_entries, last_toc_page = _parse_toc_proxy(document, toc_page)
    if not toc_entries:
        document.close()
        raise RuntimeError(f"TOC found but no entries parsed in '{filename}'.")

    filtered = [e for e in toc_entries if e['indent'] <= max_indent]
    if not filtered:
        filtered = toc_entries

    resolved = _resolve_pages_proxy(document, filtered, toc_page, last_toc_page)

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
