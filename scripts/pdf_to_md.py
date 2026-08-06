"""
Convert PDF files to Markdown using pymupdf with font-aware heading detection.

Uses font size heuristics relative to the modal body size on each page, plus
bold flags and text positioning to reconstruct a clean Markdown structure.
"""

import fitz, os, sys, re
from collections import Counter


def _all_text(spans):
    return "".join(s["text"] for s in spans)


def page_items(page):
    """
    Return list of (type, text) where type is one of:
    'h1', 'h2', 'h3', 'p', 'image'
    """
    d = page.get_text("dict")
    blocks = d["blocks"]

    # Collect all font sizes on this page
    all_sizes = []
    for b in blocks:
        if b.get("lines"):
            for l in b["lines"]:
                for s in l["spans"]:
                    t = s["text"].strip()
                    if t:
                        all_sizes.append(s["size"])

    if not all_sizes:
        return []

    size_counts = Counter(round(s, 1) for s in all_sizes)
    modal_size = size_counts.most_common(1)[0][0]

    items = []

    for b in blocks:
        if b["type"] == 1:  # Image
            items.append(("image", ""))
            continue

        if not b.get("lines"):
            continue

        lines_text = []
        block_sizes = []
        block_bolds = []

        for l in b["lines"]:
            line_spans = l["spans"]
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

        # --- Heuristics to reject non-content ---
        # Pure page numbers: 1-3 digits, alone
        if re.match(r"^\d{1,3}$", full_text):
            continue

        # "N | M" page number patterns like "3 | 21"
        if re.match(r"^\d+\s*\|\s*\d+$", full_text):
            continue

        # "N de M" page number patterns
        if re.match(r"^\d+\s+de\s+\d+$", full_text, re.IGNORECASE):
            continue

        # --- Classification ---
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
            # Collect consecutive headings at the same level with short text
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

    # Second pass: remove standalone short caps that look like continuation
    # (e.g., "DE PROCESSOS" after "GUIA DE MAPEAMENTO")
    result = []
    for typ, text in merged:
        if typ.startswith("h") and len(result) > 0:
            prev_typ, prev_text = result[-1]
            if prev_typ == typ and re.match(r"^[A-ZÀ-Ú\s\-–—]+$", text) and len(text) < 60:
                # This looks like a continuation of the previous heading
                result[-1] = (typ, prev_text + " " + text)
                continue
        result.append((typ, text))

    return result


def convert_pdf(pdf_path, md_path):
    """Convert a PDF file to Markdown."""
    doc = fitz.open(pdf_path)
    filename = os.path.basename(pdf_path)
    print(f"Convertendo: {filename} ({len(doc)} paginas)...")

    with open(md_path, "w", encoding="utf-8") as out:
        for i, page in enumerate(doc):
            items = page_items(page)
            items = merge_adjacent_headings(items)

            # Skip first page if it's essentially a cover
            # (just write as-is, but clean up)

            for typ, text in items:
                if typ == "image":
                    out.write("\n<!-- [IMAGE] -->\n\n")
                elif typ.startswith("h"):
                    level = int(typ[1])
                    out.write("#" * level + " " + text + "\n\n")
                else:
                    out.write(text + "\n\n")

            if i < len(doc) - 1:
                out.write("---\n\n")
            print(f"  Pagina {i+1}/{len(doc)} OK")

    doc.close()
    size_kb = os.path.getsize(md_path) / 1024
    print(f"  -> {os.path.basename(md_path)} ({size_kb:.1f} KB)")
    return md_path


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "D:/process-ai-prj/docs"

    pdfs = [
        "81848_81848_process-mapping-basics-2025_pt-BR-20260213_1.pdf",
        "GUIA MAPEAMENTO PROCESSOS 2.0.pdf",
    ]

    for filename in pdfs:
        pdf_path = os.path.join(base, filename)
        name_noext = os.path.splitext(filename)[0]
        md_path = os.path.join(base, f"{name_noext}.md")
        convert_pdf(pdf_path, md_path)

    print("\nConcluido!")


if __name__ == "__main__":
    main()
