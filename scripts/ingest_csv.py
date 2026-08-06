"""
ingest_csv.py — CSV to Markdown converter for process-ai ingest pipeline.

Converts CSV files to markdown pipe tables. Uses Python stdlib csv module
(no extra dependencies). Detects delimiter automatically via csv.Sniffer.
"""

import argparse
import csv
import os
import sys

# Import shared helpers from sibling script (same directory)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ingest_common import (
    emit_error, emit_success, extract_title_from_md,
    sanitize_text, slugify_for_path,
)

# Limit rows to avoid gigantic artifacts
MAX_ROWS = 1000


def _sniff_delimiter(filepath: str) -> str:
    """Detect CSV delimiter. Returns ',' if detection fails."""
    try:
        with open(filepath, 'r', encoding='utf-8-sig', newline='') as f:
            # Read enough data for sniffer
            sample = ''
            for _ in range(20):
                line = f.readline()
                if not line:
                    break
                sample += line
            if not sample.strip():
                return ','
        dialect = csv.Sniffer().sniff(sample, delimiters=',;\t|')
        return dialect.delimiter
    except Exception:
        return ','


def convert_csv(csv_path: str, output_dir: str):
    """Convert a CSV file to Markdown. Returns (md_path, images, metadata, rows)."""
    filename = os.path.basename(csv_path)
    base_name = os.path.splitext(filename)[0]
    slug = slugify_for_path(base_name)

    delimiter = _sniff_delimiter(csv_path)

    rows = []
    max_cols = 0
    truncated = False

    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f, delimiter=delimiter)
        for row in reader:
            if len(rows) >= MAX_ROWS:
                truncated = True
                break
            # Skip completely empty rows
            if all(not cell.strip() for cell in row):
                continue
            rows.append(row)
            if len(row) > max_cols:
                max_cols = len(row)

    if not rows:
        # Empty CSV → produce minimal markdown
        md_body = f"# {base_name}\n\n*(arquivo CSV vazio)*\n"
    else:
        # First non-empty row is the header
        header = rows[0]
        data_rows = rows[1:] if len(rows) > 1 else []

        # Build markdown pipe table
        lines = [f"# {base_name}\n"]

        # Header row
        padded_header = list(header) + [''] * (max_cols - len(header))
        lines.append('| ' + ' | '.join(sanitize_text(str(c)) or ' ' for c in padded_header) + ' |')
        lines.append('| ' + ' | '.join('---' for _ in range(max_cols)) + ' |')

        # Data rows
        for row in data_rows:
            padded_row = list(row) + [''] * (max_cols - len(row))
            lines.append('| ' + ' | '.join(sanitize_text(str(c)) or ' ' for c in padded_row) + ' |')

        if truncated:
            lines.append(f'\n*(tabela truncada — {MAX_ROWS} de mais linhas exibidas)*')

        md_body = '\n'.join(lines)

    # Write markdown
    md_name = f"{slug}.md"
    md_path = os.path.join(output_dir, md_name)
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_body)

    title = extract_title_from_md(md_body) or base_name
    metadata = {
        'source_file': filename,
        'title': title,
        'author': '',
        'created': '',
    }

    return md_path, [], metadata, len(rows), max_cols


def main():
    parser = argparse.ArgumentParser(description='Convert CSV to Markdown')
    parser.add_argument('--input', required=True, help='Path to CSV file')
    parser.add_argument('--output-dir', required=True,
                        help='Directory for output markdown')
    args = parser.parse_args()

    csv_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)

    if not os.path.isfile(csv_path):
        emit_error(f"Arquivo não encontrado: {csv_path}")
        return

    try:
        os.makedirs(output_dir, exist_ok=True)
        md_path, images, metadata, rows, columns = convert_csv(csv_path, output_dir)
        md_rel = os.path.relpath(md_path, output_dir).replace('\\', '/')

        emit_success(
            format='csv',
            markdown_rel=md_rel,
            images=images,
            metadata=metadata,
            rows=rows,
            columns=columns,
        )
    except Exception as e:
        emit_error(f"Falha ao converter CSV '{os.path.basename(csv_path)}': {str(e)}")


if __name__ == "__main__":
    main()
