"""
ingest_xml.py — XML to Markdown converter for process-ai ingest pipeline.

Converts XML documents to hierarchical markdown using Python stdlib
xml.etree.ElementTree (no extra dependencies). Elements become headings,
text becomes paragraphs, and attributes become blockquote metadata.
"""

import argparse
import os
import sys
import xml.etree.ElementTree as ET

# Import shared helpers from sibling script (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ingest_common import (
    emit_error, emit_success, extract_title_from_md,
    sanitize_text, slugify_for_path,
)

MAX_ELEMENTS = 2000
MAX_DEPTH = 3  # max heading level (###); beyond this uses **bold**


def _element_to_markdown(elem: ET.Element, depth: int, counter: dict) -> list[str]:
    """Recursively convert an XML element and its children to markdown lines."""
    lines = []
    counter['count'] += 1
    if counter['count'] > MAX_ELEMENTS:
        return lines

    tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag  # strip namespace

    # Heading: proportional to depth, capped at level 3
    if depth <= MAX_DEPTH:
        heading = '#' * min(depth + 1, MAX_DEPTH + 1)  # depth 0 → #, 1 → ##, etc.
        lines.append(f"\n{heading} {tag}")
    else:
        lines.append(f"\n**{tag}**")

    # Attributes as blockquote
    if elem.attrib:
        for key, val in elem.attrib.items():
            attr_key = key.split('}')[-1] if '}' in key else key
            lines.append(f"> **{attr_key}:** {sanitize_text(str(val))}")

    # Text content
    text = (elem.text or '').strip()
    if text:
        lines.append('')
        lines.append(sanitize_text(text))

    # Tail text (text after the closing tag, before next sibling)
    tail = (elem.tail or '').strip()
    if tail:
        lines.append('')
        lines.append(sanitize_text(tail))

    # Recurse into children
    for child in elem:
        lines.extend(_element_to_markdown(child, depth + 1, counter))

    return lines


def convert_xml(xml_path: str, output_dir: str):
    """Convert an XML file to Markdown. Returns (md_path, images, metadata, elements)."""
    filename = os.path.basename(xml_path)
    base_name = os.path.splitext(filename)[0]
    slug = slugify_for_path(base_name)

    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        emit_error(f"XML malformado em '{filename}': {str(e)}")
        return None, [], {}, 0
    except Exception as e:
        emit_error(f"Erro ao ler XML '{filename}': {str(e)}")
        return None, [], {}, 0

    root_tag = root.tag.split('}')[-1] if '}' in root.tag else root.tag

    counter = {'count': 0}
    body_lines = [f"# {root_tag}\n"]

    # Root attributes
    if root.attrib:
        for key, val in root.attrib.items():
            attr_key = key.split('}')[-1] if '}' in key else key
            body_lines.append(f"> **{attr_key}:** {sanitize_text(str(val))}")

    # Root text
    root_text = (root.text or '').strip()
    if root_text:
        body_lines.append('')
        body_lines.append(sanitize_text(root_text))

    # Recurse children
    for child in root:
        body_lines.extend(_element_to_markdown(child, depth=0, counter=counter))

    if counter['count'] > MAX_ELEMENTS:
        body_lines.append(f'\n\n*(documento truncado — {MAX_ELEMENTS} de mais elementos exibidos)*')

    md_body = '\n'.join(body_lines)

    # Write markdown
    md_name = f"{slug}.md"
    md_path = os.path.join(output_dir, md_name)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_body)

    title = extract_title_from_md(md_body) or root_tag
    metadata = {
        'source_file': filename,
        'title': title,
        'author': '',
        'created': '',
    }

    return md_path, [], metadata, counter['count']


def main():
    parser = argparse.ArgumentParser(description='Convert XML to Markdown')
    parser.add_argument('--input', required=True, help='Path to XML file')
    parser.add_argument('--output-dir', required=True,
                        help='Directory for output markdown')
    args = parser.parse_args()

    xml_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)

    if not os.path.isfile(xml_path):
        emit_error(f"Arquivo não encontrado: {xml_path}")
        return

    try:
        os.makedirs(output_dir, exist_ok=True)
        md_path, images, metadata, elements = convert_xml(xml_path, output_dir)
        if md_path is None:
            return  # error already emitted via emit_error
        md_rel = os.path.relpath(md_path, output_dir).replace('\\', '/')

        emit_success(
            format='xml',
            markdown_rel=md_rel,
            images=images,
            metadata=metadata,
            elements=elements,
        )
    except Exception as e:
        emit_error(f"Falha ao converter XML '{os.path.basename(xml_path)}': {str(e)}")


if __name__ == "__main__":
    main()
