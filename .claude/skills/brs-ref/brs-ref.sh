#!/bin/bash
# BrightScript Reference Skill
# Usage: /brs-ref <component-name>
#
# Searches the SDK graph for a component/interface/node and displays:
# - Component type (Node, interface, roSGNode)
# - Interfaces it implements
# - Methods from those interfaces
# - Fields (for roSGNode)

set -e

GRAPH_FILE="${GRAPH_FILE:-.}/exports/studio/graph.json"
COMPONENT_NAME="${1:-}"

if [[ -z "$COMPONENT_NAME" ]]; then
  cat << 'EOF'
## BrightScript Reference

Look up a component, interface, or SceneGraph node from the Roku SDK.

**Usage:**
  /brs-ref roArray
  /brs-ref ifArray
  /brs-ref Video

**What you'll see:**
- Component type and basic info
- Interfaces it implements
- Methods available (if a component/interface)
- Fields available (if a SceneGraph node)

EOF
  exit 0
fi

if [[ ! -f "$GRAPH_FILE" ]]; then
  echo "❌ Graph file not found at: $GRAPH_FILE"
  echo "Run: npm run generate-sdk-exports"
  exit 1
fi

# Normalize search term: roArray → ro:roArray, ifArray → if:ifArray, Scene → sg:Scene
# Try multiple prefixes if no namespace given
if [[ ! "$COMPONENT_NAME" =~ : ]]; then
  # Determine prefix based on naming convention
  if [[ "$COMPONENT_NAME" =~ ^if[A-Z] ]]; then
    SEARCH_ID="if:$COMPONENT_NAME"
  elif [[ "$COMPONENT_NAME" =~ ^ro[A-Z] ]]; then
    SEARCH_ID="ro:$COMPONENT_NAME"
  else
    # For generic names (Scene, Node, Animation), try ro: first, then sg:, then if:
    for prefix in "ro" "sg" "if"; do
      TEST_ID="$prefix:$COMPONENT_NAME"
      if jq -e ".nodes[] | select(.id == \"$TEST_ID\")" "$GRAPH_FILE" > /dev/null 2>&1; then
        SEARCH_ID="$TEST_ID"
        break
      fi
    done
    if [[ -z "$SEARCH_ID" ]]; then
      SEARCH_ID="ro:$COMPONENT_NAME"  # default fallback
    fi
  fi
else
  SEARCH_ID="$COMPONENT_NAME"
fi

# Query the graph
NODE_INFO=$(jq ".nodes[] | select(.id == \"$SEARCH_ID\")" "$GRAPH_FILE")

if [[ -z "$NODE_INFO" ]]; then
  echo "❌ Component not found: $COMPONENT_NAME"
  echo ""
  echo "Try searching for:"
  jq -r '.nodes[] | select(.type == "Node" or .type == "interface" or .type == "roSGNode") | .label' "$GRAPH_FILE" | sort -u | head -20 | sed 's/^/  - /'
  exit 1
fi

# Extract node details
NODE_ID=$(echo "$NODE_INFO" | jq -r '.id')
NODE_TYPE=$(echo "$NODE_INFO" | jq -r '.type')
NODE_LABEL=$(echo "$NODE_INFO" | jq -r '.label')

echo "# $NODE_LABEL"
echo ""
echo "**Type:** \`$NODE_TYPE\`"
echo ""

# Find what this implements
IMPLEMENTS=$(jq -r ".links[] | select(.source == \"$NODE_ID\" and .relation == \"implements\") | .target" "$GRAPH_FILE" | sort -u)
if [[ -n "$IMPLEMENTS" ]]; then
  echo "## Implements"
  echo ""
  echo "$IMPLEMENTS" | while read iface; do
    IFACE_LABEL=$(jq -r ".nodes[] | select(.id == \"$iface\") | .label" "$GRAPH_FILE")
    echo "- \`$IFACE_LABEL\`"
  done
  echo ""
fi

# Find methods (has_method edges from interfaces this node implements)
if [[ -n "$IMPLEMENTS" ]]; then
  # Build array of implemented interface IDs for jq
  IMPLEMENTS_ARRAY=$(echo "$IMPLEMENTS" | jq -R . | jq -s .)
  METHODS=$(jq -r --argjson ifaces "$IMPLEMENTS_ARRAY" ".links[] | select((.source == \"$NODE_ID\" or (.source | IN(\$ifaces[]))) and .relation == \"has_method\") | .target" "$GRAPH_FILE" | sort -u)
else
  METHODS=$(jq -r ".links[] | select(.source == \"$NODE_ID\" and .relation == \"has_method\") | .target" "$GRAPH_FILE" | sort -u)
fi

if [[ -n "$METHODS" ]]; then
  echo "## Methods"
  echo ""
  echo "$METHODS" | while read method_id; do
    METHOD_INFO=$(jq ".nodes[] | select(.id == \"$method_id\")" "$GRAPH_FILE")
    METHOD_LABEL=$(echo "$METHOD_INFO" | jq -r '.label')
    echo "- \`$METHOD_LABEL\`"
  done
  echo ""
fi

# Find fields (has_field edges)
FIELDS=$(jq -r ".links[] | select(.source == \"$NODE_ID\" and .relation == \"has_field\") | .target" "$GRAPH_FILE" | sort -u)
if [[ -n "$FIELDS" ]]; then
  echo "## Fields"
  echo ""
  echo "$FIELDS" | while read field_id; do
    FIELD_INFO=$(jq ".nodes[] | select(.id == \"$field_id\")" "$GRAPH_FILE")
    FIELD_LABEL=$(echo "$FIELD_INFO" | jq -r '.label')
    echo "- \`$FIELD_LABEL\`"
  done
  echo ""
fi

# Find what extends this (if it's a base type)
EXTENDED_BY=$(jq -r ".links[] | select(.target == \"$NODE_ID\" and .relation == \"extends\") | .source" "$GRAPH_FILE" | sort -u)
if [[ -n "$EXTENDED_BY" ]]; then
  echo "## Extended by"
  echo ""
  echo "$EXTENDED_BY" | while read extending; do
    EXT_LABEL=$(jq -r ".nodes[] | select(.id == \"$extending\") | .label" "$GRAPH_FILE")
    echo "- \`$EXT_LABEL\`"
  done
  echo ""
fi

echo "---"
echo "*For the complete graph, see \`exports/studio/graph.json\`*"
