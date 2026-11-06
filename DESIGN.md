# DESIGN — Flight Bag (todo_new)

<!-- impeccable:design-schema 1 -->

Visual authority: this file and `.impeccable/design.json`. Product truth lives in
`PRODUCT.md`; surface strategy in `.impeccable/briefs/app-shell.md`.

## World

Flight Planning: chart-tint paper over a faint lat/long grid, engraved-caps
labels, flat unmodulated state color. The world contributes type, palette,
density, and one signature move — never layout or controls, which stay
standard web components (Operate mode contract).

## Color

| Token | Value | Job |
|---|---|---|
| `--paper` | `#F7F5EF` | Ground — chart-tint paper |
| `--paper-deep` | `#EFEDE4` | recessed panels, active rail fill |
| `--ink` | `#1E2A38` | body ink, primary buttons |
| `--ink-soft` | `#5A6675` | secondary text, caps labels |
| `--notam` | `#C8102E` | NOTAM red — assumptions strip, alerts, overrides, active-nav border |
| `--chart` | `#1D5FA8` | chart blue — primary actions, planned state, route-profile bars |
| `--amber` | `#E8B93B` | amber — pending review, dumping state |
| `--clear` | `#2E7D4F` | clearance green — doing/done/on-track |
| `--hairline` | `rgba(30,42,56,.16)` | borders |
| `--grid-line` | `rgba(30,42,56,.055)` | lat/long ground grid, 96px rhythm |

Strategy: Restrained — tinted neutrals plus fully committed state colors.
No muddy greys, no gradients, no shadow blur; cards lift with a hard
`0 4px 0` offset shadow on hover only.

## Typography

Workhorse system sans (`ui-sans-serif, -apple-system, SF Pro Text, Segoe UI,
Roboto`). Display = the same face at 700–800, tight tracking. The world's
voice is the `.caps` label class: uppercase, 11px, +0.14em tracking, 600 —
used for every section header, stamp, and axis label (engraved-caps register).
Numbers read as data: `tabular-nums` everywhere hours/dates appear.

## Signature move

The **NOTAM strip**: every assumption the AI filed about a plan renders as a
NOTAM — a red-bordered "read before departure" panel above the dispatch
release. Pending NOTAMs carry an inline override field; overriding saves
the correction instantly (no LLM), and **Re-file flight plan** regenerates
the plan around all overrides. On the manifest, unreviewed NOTAMs appear as a red diamond
badge on the dispatch card.

Second move: the **route profile** (Route Profile page) draws scheduled legs
as bars whose length is their estimated hours with AI, to scale, against an
hour-axis built from the user's per-weekday capacity — duration is geometry.

## Components

- **Rail** (left, 208px): brand block + three nav items; active item gets a
  NOTAM-red left border and `--paper-deep` fill.
- **Dispatch card**: the checkbox and drag grip share one left-edge slot —
  the grip (drawn 6-dot handle, chart blue) is revealed in the checkbox's
  place on card hover or grip focus (Gmail pattern); clicking it selects,
  arrow keys reorder, dragging works from anywhere on the card. Dragged card:
  40% opacity, −1.5° tilt. Hovering a card while dragging opens a chart-blue
  insertion marker at its top edge. Then title, open-leg count, ETA in caps
  mono, status stamp, NOTAM badge, Open.
- **Stamp**: 1.5px border, 2px radius, −1.5deg rotation, uppercase 10px —
  the release-stamp voice. Color encodes state: dumping/amber, planned/blue,
  doing/green, done/grey, failed/red.
- **Dispatch release**: bordered sheet with a `--paper-deep` title block
  header showing total hours (with AI / solo). Legs are rows: checkbox,
  title + why, hours as `2.5h (was 6h)`, exec-strategy select, dispatch
  button, exec-status stamp.
- **Buttons**: solid ink (default), ghost (outline), chart (blue), notam
  (red). 4px radius, hover lifts 1px.
- **Inputs**: white fill, hairline border, chart-blue focus ring.

## Motion

Single easing `--settle: cubic-bezier(0.34, 1.4, 0.64, 1)` at 0.4s — overshoot
and settle, expedition pacing (deliberate world choice; detector waiver).
Cards lift 1–2px on hover; nothing animates on load.

## Responsive

≤720px: rail collapses to a horizontal top bar (bottom border active
indicator); cards wrap their meta rows; leg rows wrap. Verified at 390×844 —
no element exceeds the viewport (`scrollWidth == clientWidth`).

## Files

- Tokens + components: `app/globals.css`
- Shell: `app/layout.tsx`, `app/rail.tsx`
- Manifest: `app/page.tsx`, `app/board.tsx`
- Flight detail (dump, NOTAMs, release): `app/todo/[id]/`
- Route profile: `app/profile/`
- Briefs: `app/briefs/`
