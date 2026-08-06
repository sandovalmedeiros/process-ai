"""
ingest_common.py — Shared helpers for process-ai ingest scripts.

Format detection via magic bytes, image extraction pipeline, JSON contract
emission, and markdown utilities. Used by ingest_pdf.py, ingest_docx.py,
ingest_pptx.py.
"""

import json
import os
import sys
import re
from typing import Optional


# ---- Format detection (magic bytes, not extension) ----

def detect_format(filepath: str) -> Optional[str]:
    """Detect document format by magic bytes. Returns 'pdf', 'docx', 'pptx', or None."""
    try:
        with open(filepath, 'rb') as f:
            header = f.read(8)
    except (OSError, IOError):
        return None

    if len(header) < 4:
        return None

    # PDF: %PDF-
    if header[:5] == b'%PDF-':
        return 'pdf'

    # DOCX/PPTX: ZIP magic + [Content_Types].xml
    if header[:4] == b'PK\x03\x04':
        # Read more to find [Content_Types].xml
        try:
            with open(filepath, 'rb') as f:
                content = f.read(4096)  # first 4KB is enough
        except (OSError, IOError):
            return None
        if b'[Content_Types].xml' not in content:
            return None
        content_str = content.decode('utf-8', errors='ignore')
        if 'application/vnd.openxmlformats-officedocument.presentationml' in content_str:
            return 'pptx'
        if 'application/vnd.openxmlformats-officedocument.wordprocessingml' in content_str:
            return 'docx'
        # Fallback heuristic: pptx has slide*.xml files
        if b'ppt/slides/' in content or b'slide' in content.lower():
            return 'pptx'
        if b'word/' in content:
            return 'docx'
        return None

    return None


# ---- Supported formats registry ----

SUPPORTED_EXTENSIONS = {'.pdf', '.docx', '.pptx'}

# Map format to (display_name, script_name)
FORMAT_INFO = {
    'pdf':  ('PDF',  'ingest_pdf.py'),
    'docx': ('DOCX', 'ingest_docx.py'),
    'pptx': ('PPTX', 'ingest_pptx.py'),
}


# ---- JSON contract emission ----

def emit_result(result: dict) -> None:
    """Write the JSON result contract to stdout and exit."""
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write('\n')
    sys.stdout.flush()


def emit_error(message: str) -> None:
    """Write an error contract to stdout and exit 0 (error is in JSON, not exit code)."""
    emit_result({'ok': False, 'error': message})


def emit_success(format: str, markdown_rel: str, images: list,
                 metadata: dict, **extra) -> None:
    """Write a success contract to stdout."""
    result = {
        'ok': True,
        'format': format,
        'markdown': markdown_rel,
        'images': images,
        'metadata': metadata,
    }
    result.update(extra)
    emit_result(result)


# ---- Markdown utilities ----

def sanitize_text(text: str) -> str:
    """Collapse whitespace and strip decorative chars from extracted text."""
    if not text:
        return ''
    # Collapse multiple spaces
    text = re.sub(r' {2,}', ' ', text)
    # Collapse 3+ newlines into 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def slugify_for_path(text: str, max_len: int = 60) -> str:
    """Convert arbitrary text to a filesystem-safe slug [a-z0-9-]+."""
    if not text:
        return 'documento'

    translit = {
        'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
        'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
        'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
        'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o', 'ø': 'o',
        'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
        'ñ': 'n', 'ç': 'c', 'ß': 'ss', 'ÿ': 'y',
        'œ': 'oe', 'þ': 'th', 'ð': 'd',
        'À': 'a', 'Á': 'a', 'Â': 'a', 'Ã': 'a', 'Ä': 'a', 'Å': 'a', 'Æ': 'ae',
        'È': 'e', 'É': 'e', 'Ê': 'e', 'Ë': 'e',
        'Ì': 'i', 'Í': 'i', 'Î': 'i', 'Ï': 'i',
        'Ò': 'o', 'Ó': 'o', 'Ô': 'o', 'Õ': 'o', 'Ö': 'o', 'Ø': 'o',
        'Ù': 'u', 'Ú': 'u', 'Û': 'u', 'Ü': 'u',
        'Ñ': 'n', 'Ç': 'c', 'Ÿ': 'y',
        'Œ': 'oe', 'Þ': 'th',
    }

    out = ''
    for ch in text.strip():
        out += translit.get(ch, ch)
    out = out.lower()
    out = re.sub(r'[^a-z0-9]+', '-', out)
    out = out.strip('-')

    if not out:
        return 'documento'

    if len(out) <= max_len:
        return out
    # Truncate at last hyphen before max_len
    truncated = out[:max_len]
    last_hyphen = truncated.rfind('-')
    if last_hyphen > 0:
        return truncated[:last_hyphen]
    return truncated


def extract_title_from_md(md_text: str) -> str:
    """Extract H1 title from markdown, or first non-empty line."""
    lines = md_text.split('\n')
    for line in lines:
        m = re.match(r'^#\s+(.+)$', line)
        if m:
            return m.group(1).strip()
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('#'):
            return stripped[:80] if len(stripped) > 80 else stripped
    return ''


# ---- Image pipeline ----

def ensure_images_dir(output_dir: str, base_name: str) -> str:
    """Create images/<base_name>/ directory and return its absolute path."""
    img_dir = os.path.join(output_dir, 'images', base_name)
    os.makedirs(img_dir, exist_ok=True)
    return img_dir


def save_image_bytes(data: bytes, ext: str, img_dir: str,
                     counter: int) -> str:
    """Save image bytes to disk. Returns relative path from output_dir parent."""
    fname = f'img{counter:03d}.{ext}' if ext else f'img{counter:03d}.png'
    fpath = os.path.join(img_dir, fname)
    with open(fpath, 'wb') as f:
        f.write(data)
    return fpath


# ---- Page-number detection patterns (shared) ----

PAGE_NUMBER_PATTERNS = [
    re.compile(r'^\d{1,3}$'),                     # "42"
    re.compile(r'^\d+\s*\|\s*\d+$'),              # "3 | 21"
    re.compile(r'^\d+\s+de\s+\d+$', re.IGNORECASE),  # "3 de 21"
    re.compile(r'^P[aá]g(?:ina)?\s+\d+(\s+de\s+\d+)?$', re.IGNORECASE),  # "Página 5" / "Pagina 5 de 20"
]


def looks_like_page_number(text: str) -> bool:
    """Check if text looks like a standalone page number."""
    stripped = text.strip()
    for pat in PAGE_NUMBER_PATTERNS:
        if pat.match(stripped):
            return True
    return False
