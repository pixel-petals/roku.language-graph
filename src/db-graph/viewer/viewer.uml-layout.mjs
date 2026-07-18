/**
 * viewer.uml-layout.mjs
 *
 * Pure layout logic behind a UML class box's rendering in viewer.canvas.mjs:
 * how its member sections (Properties/Public Functions/Private Functions)
 * turn into label text and a required box size, and — the same math run in
 * reverse — how a click position (as a 0..1 fraction of the box's own
 * rendered height) maps back to which section was clicked. Kept in one
 * place and shared by all three so the label, the box size, and the click
 * hit-testing can never disagree about where a section's lines fall.
 * Split out from viewer.canvas.mjs so this geometry is unit-testable
 * without a canvas/G6 instance, same reasoning as editor.pipeline.mjs.
 */

// A class with dozens of members (real code has these) would otherwise
// produce a box so tall the force layout can't keep it from overlapping its
// neighbors regardless of spacing — capped per section, like a real UML
// tool eliding a large member list, rather than chasing layout tuning that
// can't fix an unboundedly tall box.
export const MAX_MEMBER_LINES = 8;

export function cappedMemberLines(members) {
  if (members.length <= MAX_MEMBER_LINES) return members;
  return [...members.slice(0, MAX_MEMBER_LINES), `… and ${members.length - MAX_MEMBER_LINES} more`];
}

// Section key -> its box header. Order here is the order sections render in
// (properties above public functions above private functions, matching
// conventional UML layout).
export const UML_SECTIONS = [
  ['fields', 'Properties'],
  ['publicMethods', 'Public Functions'],
  ['privateMethods', 'Private Functions'],
];

// Lines before the first section (the «stereotype» and name lines) — shared
// by every function below so they can't disagree about where sections start.
export const UML_HEADER_LINES = 2;

/**
 * Per-populated-section line spans (`{key, lines: string[]}`) for a class
 * box, given an explicit visibility map. A folded section
 * (visibility[key] === false) always costs exactly 1 line (its header, with
 * a count) regardless of how many members it actually has; an unfolded
 * section costs its header plus its capped member list.
 */
export function umlSectionLayout(data, visibility) {
  return UML_SECTIONS.filter(([key]) => data.members[key].length).map(([key, label]) => {
    const members = data.members[key];
    const folded = visibility[key] === false;
    const header = `― ${label} (${members.length}${folded ? ', folded' : ''}) ―`;
    return { key, lines: folded ? [header] : [header, ...cappedMemberLines(members)] };
  });
}

/** Every line a class box's label renders, in order — the stereotype/name header, then each section's own lines. */
export function umlAllLines(data, visibility) {
  return [`«${data.kind}»`, data.name, ...umlSectionLayout(data, visibility).flatMap(s => s.lines)];
}

/** A UML class box's multi-line label: stereotype + name, then one folded/unfolded section per populated member bucket. */
export function umlLabelText(data, visibility) {
  return umlAllLines(data, visibility).join('\n');
}

export const UML_LABEL_PADDING_X = 10;
export const UML_MIN_BOX_WIDTH = 150;
export const UML_MAX_BOX_WIDTH = 320;
// A rough monospace advance width at labelFontSize 10 (see viewer.canvas.mjs)
// — close enough to size the box to its own text without needing an actual
// canvas measureText() call (this is pure, DOM-free layout logic; see the
// file header).
const CHAR_WIDTH = 6;

/** A box's width, sized (and clamped) to its own longest line — shared by umlNodeSize and umlLabelOffsetX so they can't disagree about it. */
export function umlNodeWidth(lines) {
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return Math.min(UML_MAX_BOX_WIDTH, Math.max(UML_MIN_BOX_WIDTH, longest * CHAR_WIDTH + UML_LABEL_PADDING_X * 2));
}

/** [width, height] sized to a UML class box's (capped, fold-aware) content — wide enough for its longest line, tall enough for its line count. */
export function umlNodeSize(data, visibility) {
  const lines = umlAllLines(data, visibility);
  return [umlNodeWidth(lines), 16 + lines.length * 16];
}

/**
 * The label's left-inset x offset (see viewer.canvas.mjs): `labelPlacement:
 * 'center'` anchors a label at the key shape's horizontal *center*, so
 * `labelTextAlign: 'left'` alone still starts every line at the box's
 * midpoint rather than its left edge (reproduced directly, not assumed) —
 * shifting the anchor left by half the box's own width (minus a little
 * padding) puts it at the box's left edge instead.
 */
export function umlLabelOffsetX(data, visibility) {
  const width = umlNodeWidth(umlAllLines(data, visibility));
  return -(width / 2 - UML_LABEL_PADDING_X);
}

/**
 * Maps a fractional 0..1 position down a class box's rendered height (see
 * DbGraphCanvas#onUmlNodeClick) to the section key whose header or member
 * list occupies that line — null if it lands on the stereotype/name header
 * lines, or past the last section (a stray click below the last line).
 */
export function umlSectionAtFraction(data, visibility, fraction) {
  const layout = umlSectionLayout(data, visibility);
  const totalLines = UML_HEADER_LINES + layout.reduce((sum, s) => sum + s.lines.length, 0);
  let lineIndex = Math.floor(fraction * totalLines) - UML_HEADER_LINES;
  if (lineIndex < 0) return null;
  for (const section of layout) {
    if (lineIndex < section.lines.length) return section.key;
    lineIndex -= section.lines.length;
  }
  return null;
}
