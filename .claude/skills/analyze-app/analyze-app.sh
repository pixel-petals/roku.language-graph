#!/bin/bash
# Roku App Analyzer Skill
# Usage: /analyze-app <app-dir> [output-dir]
#
# Parses all .brs and .xml files in a Roku app, builds a code graph,
# and generates a Graphify wiki + interactive HTML studio.

APP_DIR="${1:-}"
OUTPUT_DIR="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROKU_GRAPHIFY_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [[ -z "$APP_DIR" ]]; then
  cat << 'EOF'
## Roku App Analyzer

Analyze a Roku channel's BrightScript + SceneGraph code with Graphify.

**Usage:**
  /analyze-app <app-dir>
  /analyze-app <app-dir> <output-dir>

**What it generates:**
- `studio/index.html`  — Interactive visual graph explorer (open in browser)
- `wiki/`              — Markdown pages grouped by community
- `.graphify-state/graph.json` — Raw graph data

**What it extracts:**
- SceneGraph component hierarchy (extends, contains)
- Interface fields per component
- BrightScript functions/subs
- Function call graph
- Roku SDK objects used (via CreateObject)
- onChange handler wiring (field → function)

**Example:**
  /analyze-app ~/my-roku-app
  /analyze-app ~/my-roku-app ~/my-roku-app/graphify-output

EOF
  exit 0
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "❌ Directory not found: $APP_DIR"
  exit 1
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$APP_DIR/graphify-output"
fi

echo "Running roku-graphify on: $APP_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

node "$ROKU_GRAPHIFY_DIR/src/analyze-app.mjs" "$APP_DIR" "$OUTPUT_DIR"
