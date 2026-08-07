#!/usr/bin/env python3
"""
Check story files for unresolved template placeholders.

Scans story markdown files in the implementation artifacts directory for
unresolved `{{placeholder}}` patterns and Dev Agent Record completeness.

Usage:
  python scripts/check-story-placeholders.py [--dir <directory>] [--ci]

Exit codes:
  0 = all stories clean
  1 = placeholders found (CI mode: fails the build)
  2 = usage error
"""

import sys
import re
import argparse
from pathlib import Path

# Patterns that indicate unresolved placeholders
PLACEHOLDER_PATTERNS = [
    (r'\{\{agent_model_name_version\}\}', 'Dev Agent Record: model name placeholder'),
    (r'\{\{.*?\}\}', 'Generic template placeholder'),
]

# Required sections that must be present in a completed story
REQUIRED_SECTIONS = [
    '## Dev Agent Record',
    '### Agent Model Used',
    '### Completion Notes List',
    '### File List',
]


def find_story_files(directory: str) -> list[Path]:
    """Find all story markdown files in the given directory."""
    story_dir = Path(directory)
    if not story_dir.exists():
        return []

    stories = []
    for f in story_dir.glob('*.md'):
        # Match story pattern: N-M-name.md (e.g., 4-2-self-check-gate.md)
        name = f.stem
        parts = name.split('-', 2)
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            stories.append(f)
    return sorted(stories)


def load_done_stories(sprint_status_path: str) -> set[str]:
    """Load the set of story keys marked 'done' in sprint-status.yaml."""
    done = set()
    status_file = Path(sprint_status_path)
    if not status_file.exists():
        return done

    try:
        content = status_file.read_text(encoding='utf-8')
        # Simple regex-based parser — avoids yaml dependency
        in_dev_status = False
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('development_status:'):
                in_dev_status = True
                continue
            if in_dev_status:
                if line.startswith('action_items:'):
                    break
                # Match: "story-key: done" or "story-key: backlog" etc.
                match = re.match(r'^([\w-]+):\s*(.+)$', line)
                if match and match.group(2).strip() == 'done':
                    done.add(match.group(1))
    except Exception:
        pass

    return done


def extract_dev_record(content: str) -> str:
    """Extract only the Dev Agent Record section from the story file."""
    match = re.search(r'## Dev Agent Record\s*\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
    if match:
        return match.group(1)
    return ''


def check_file(filepath: Path) -> list[str]:
    """Check a single story file for placeholders. Returns list of issues found."""
    issues = []

    try:
        content = filepath.read_text(encoding='utf-8')
    except Exception as e:
        return [f'ERROR reading file: {e}']

    # Only check the Dev Agent Record section — narrative body may reference
    # placeholders as examples, which is legitimate.
    dev_record = extract_dev_record(content)

    if not dev_record:
        issues.append('Dev Agent Record section not found')
        return issues

    # Check for placeholder patterns in Dev Agent Record only
    for pattern, description in PLACEHOLDER_PATTERNS:
        matches = re.findall(pattern, dev_record)
        for match in matches:
            issues.append(f'{description}: "{match}"')

    # Check that Dev Agent Record exists and has content beyond placeholders
    if '{{agent_model_name_version}}' in dev_record:
        issues.append('Dev Agent Record contains literal {{agent_model_name_version}} placeholder')

    # Check for blank agent model
    agent_model_match = re.search(r'### Agent Model Used\s*\n\s*\n', dev_record)
    if agent_model_match:
        issues.append('Agent Model Used section is empty')

    return issues


def main():
    parser = argparse.ArgumentParser(
        description='Check story files for unresolved template placeholders'
    )
    parser.add_argument(
        '--dir',
        default='_bmad-output/implementation-artifacts',
        help='Directory containing story files (default: _bmad-output/implementation-artifacts)'
    )
    parser.add_argument(
        '--ci',
        action='store_true',
        help='CI mode: exit 1 if any story has placeholders'
    )
    parser.add_argument(
        '--story',
        help='Check a specific story file instead of scanning the directory'
    )
    args = parser.parse_args()

    if args.story:
        files = [Path(args.story)]
        done_stories = set()
    else:
        files = find_story_files(args.dir)
        # Skip stories marked 'done' in sprint status
        sprint_yaml = str(Path(args.dir) / 'sprint-status.yaml')
        done_stories = load_done_stories(sprint_yaml)

    if not files:
        print('No story files found.')
        return 0

    total_issues = 0
    clean_count = 0
    skipped_count = 0

    for filepath in files:
        name = filepath.stem
        if name in done_stories:
            skipped_count += 1
            continue

        issues = check_file(filepath)

        status = filepath.stem
        if issues:
            print(f'❌ {status}: {len(issues)} issue(s)')
            for issue in issues:
                print(f'   - {issue}')
            total_issues += len(issues)
        else:
            print(f'✅ {status}: clean')
            clean_count += 1

    print(f'\n---')
    print(f'Files scanned: {len(files)}')
    print(f'Skipped (done): {skipped_count}')
    print(f'Clean: {clean_count}')
    print(f'Issues found: {total_issues}')

    if args.ci and total_issues > 0:
        print('\n❌ CI CHECK FAILED: Unresolved placeholders found in story files.')
        return 1

    if total_issues > 0:
        print('\n⚠️  Some story files contain unresolved placeholders.')
        print('   These stories should not be marked as done until placeholders are resolved.')
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
