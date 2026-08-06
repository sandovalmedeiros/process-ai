"""
ingest_pdf.py — Convert PDF files to Markdown using pymupdf.

Part of process-ai ingest pipeline. Uses font-size heuristics relative to
the modal body size on each page, plus bold flags and text positioning to
reconstruct a clean Markdown structure.

Contract: emits JSON to stdout — { ok, format, pages, markdown, images, metadata }
"""

import argparse
import os
import re
from collections import Counter

import fitz  # pymupdf

# Import shared helpers from sibling script
from ingest_common import (
    emit_error,
    emit_success,
    extract_title_from_md,
    looks_like_page_number,
    slugify_for_path,
    save_image_bytes,
    ensure_images_dir,
)


def _all_text(spans):
    return "".join(s["text"] for s in spans)


def page_items(page):
    """Return list of (type, text) where type is one of: 'h1','h2','h3','p','image'."""
    d = page.get_text("dict")
    blocks = d["blocks"]

    # Collect all font sizes on this page
    all_sizes = []
    for b in blocks:
        if b.get("lines"):
            for line in b["lines"]:
                for s in line["spans"]:
                    t = s["text"].strip()
                    if t:
                        all_sizes.append(s["size"])

    if not all_sizes:
        return []

    size_counts = Counter(round(s, 1) for s in all_sizes)
    modal_size = size_counts.most_common(1)[0][0]

    items = []

    for b in blocks:
        if b["type"] == 1:  # Image block
            items.append(("image", ""))
            continue

        if not b.get("lines"):
            continue

        lines_text = []
        block_sizes = []
        block_bolds = []

        for line in b["lines"]:
            line_spans = line["spans"]
            txt = _all_text(line_spans).strip()
            if txt:
                lines_text.append(txt)
            for s in line_spans:
                if s["text"].strip():
                    block_sizes.append(s["size"])
                    block_bolds.append(bool(s["flags"] & 2**2))

        if not lines_text:
            continue

        full_text = "\n".join(lines_text).strip()
        full_text = re.sub(r" {2,}", " ", full_text)
        full_text = re.sub(r"\n{3,}", "\n\n", full_text)

        if not full_text:
            continue

        avg_size = sum(block_sizes) / len(block_sizes) if block_sizes else modal_size
        any_bold = any(block_bolds)

        # Reject page numbers
        if looks_like_page_number(full_text):
            continue

        # Classification
        ratio = avg_size / modal_size if modal_size else 1.0

        is_heading = False
        level = 0

        # Known heading patterns (Portuguese + English)
        heading_patterns = [
            (r"^(Cap[ií]tulo|Se[cç][aã]o|Parte|Anexo|Ap[eê]ndice|M[oó]dulo|Unidade)\s", 1),
            (r"^(Introdu[cç][aã]o|Conclus[aã]o|Refer[eê]ncias|Sum[aá]rio|Gloss[aá]rio|Bibliografia)", 1),
            (r"^\d+(\.\d+)*\s+[A-ZÀ-Ú][a-zà-ú]", 2),
            (r"^(Figura|Tabela|Quadro|Gr[aá]fico)\s+\d+", 3),
        ]

        for pat, hlevel in heading_patterns:
            if re.match(pat, full_text, re.IGNORECASE):
                is_heading = True
                level = hlevel
                break

        # Font-size-based detection
        if not is_heading and ratio >= 2.5:
            is_heading = True
            level = 1
        elif not is_heading and ratio >= 1.8:
            is_heading = True
            level = 2
        elif not is_heading and ratio >= 1.4:
            is_heading = True
            level = 3
        elif not is_heading and any_bold and len(full_text) < 150 and ratio >= 1.1:
            is_heading = True
            level = 3

        if is_heading:
            items.append((f"h{level}", full_text))
        else:
            items.append(("p", full_text))

    return items


def merge_adjacent_headings(items):
    """Merge consecutive headings that are parts of the same title."""
    if len(items) < 2:
        return items

    merged = []
    i = 0
    while i < len(items):
        typ, text = items[i]

        if typ.startswith("h"):
            parts = [text]
            j = i + 1
            while j < len(items):
                nt, ntext = items[j]
                if nt == typ and len(ntext) < 80:
                    parts.append(ntext)
                    j += 1
                else:
                    break
            if len(parts) > 1:
                merged.append((typ, "\n".join(parts)))
            else:
                merged.append((typ, text))
            i = j
        else:
            merged.append((typ, text))
            i += 1

    # Second pass: merge standalone short caps that look like continuation
    result = []
    for typ, text in merged:
        if typ.startswith("h") and len(result) > 0:
            prev_typ, prev_text = result[-1]
            if prev_typ == typ and re.match(r"^[A-ZÀ-Ú\s\-–—]+$", text) and len(text) < 60:
                result[-1] = (typ, prev_text + " " + text)
                continue
        result.append((typ, text))

    return result


def extract_images_from_page(page, page_num, img_dir):
    """Extract all images from a page and save them. Returns list of (rel_path, width, height)."""
    results = []
    image_list = page.get_images(full=True)
    for img_idx, img in enumerate(image_list):
        xref = img[0]
        base_image = page.extract_image(xref)
        image_bytes = base_image["image"]
        ext = base_image["ext"]
        w, h = base_image["width"], base_image["height"]

        img_path = save_image_bytes(
            image_bytes, ext, img_dir,
            page_num * 100 + img_idx,
        )
        results.append((img_path, w, h))
    return results


def convert_pdf(pdf_path, output_dir):
    """Convert a PDF file to Markdown. Returns (markdown_path, images_rel, metadata)."""
    doc = fitz.open(pdf_path)
    filename = os.path.basename(pdf_path)
    base_name = os.path.splitext(filename)[0]
    slug = slugify_for_path(base_name)

    img_dir = ensure_images_dir(output_dir, slug)
    all_images = []

    md_name = f"{slug}.md"
    md_path = os.path.join(output_dir, md_name)

    # Extract metadata (doc.metadata may be None)
    meta = doc.metadata or {}
    metadata = {
        'source_file': filename,
        'title': meta.get('title', '') or base_name,
        'author': meta.get('author', '') or '',
        'created': meta.get('creationDate', '') or '',
    }

    image_counter = 0
    page_count = len(doc)

    with open(md_path, "w", encoding="utf-8") as out:
        for i in range(page_count):
            page = doc[i]
            # Extract images from this page
            page_imgs = extract_images_from_page(page, i, img_dir)

            items = page_items(page)
            items = merge_adjacent_headings(items)

            for typ, text in items:
                if typ == "image":
                    if image_counter < len(page_imgs):
                        img_rel = os.path.relpath(
                            page_imgs[image_counter][0], output_dir
                        ).replace('\\', '/')
                        w, h = page_imgs[image_counter][1]
                        out.write(f'<figure>\n')
                        out.write(f'  <img src="{img_rel}" ')
                        out.write(f'alt="[Image]" width="{w}" height="{h}" />\n')
                        out.write(f'  <figcaption><!-- [IMAGE] --></figcaption>\n')
                        out.write(f'</figure>\n\n')
                        all_images.append(img_rel)
                        image_counter += 1
                    else:
                        out.write("\n<!-- [IMAGE] -->\n\n")
                elif typ.startswith("h"):
                    level = int(typ[1])
                    out.write("#" * level + " " + text + "\n\n")
                else:
                    out.write(text + "\n\n")

            if i < len(doc) - 1:
                out.write("---\n\n")

    doc.close()

    # Read back the markdown to extract title
    with open(md_path, 'r', encoding='utf-8') as f:
        md_content = f.read()
    extracted_title = extract_title_from_md(md_content)
    if extracted_title:
        metadata['title'] = extracted_title

    return md_path, all_images, metadata, page_count


def main():
    parser = argparse.ArgumentParser(
        description='Convert PDF to Markdown (process-ai ingest)',
    )
    parser.add_argument('--input', required=True, help='Path to PDF file')
    parser.add_argument('--output-dir', required=True,
                        help='Directory for output markdown + images')
    args = parser.parse_args()

    pdf_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)

    if not os.path.isfile(pdf_path):
        emit_error(f"Arquivo não encontrado: {pdf_path}")
        return

    try:
        os.makedirs(output_dir, exist_ok=True)
        md_path, images, metadata, page_count = convert_pdf(pdf_path, output_dir)
        md_rel = os.path.relpath(md_path, output_dir).replace('\\', '/')

        emit_success(
            format='pdf',
            markdown_rel=md_rel,
            images=images,
            metadata=metadata,
            pages=page_count,
        )
    except Exception as e:
        emit_error(f"Falha ao converter PDF '{os.path.basename(pdf_path)}': {str(e)}")


if __name__ == "__main__":
    main()
