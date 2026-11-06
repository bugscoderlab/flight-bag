# Surface brief — app shell (dashboard, todo detail, route profile)

<!-- impeccable:surface-brief 1 -->

## Scope & visitor mode

Operate. Solo user, daily personal use: dump thoughts, review AI-built plans,
veto assumptions, work the queue, watch ETAs.

## Direction contract

THESIS: The flight bag that plans for you. Every project is a flight:
the AI files a dispatch release (the plan) and a strip of NOTAMs
(its stated assumptions) you read before departure; the category-default
sidebar-plus-cards productivity shell is refused — the assumption briefing,
the product's actual mechanism, owns the top of every plan instead of a
generic header.

OWN-WORLD: Chart-tint paper ground (#F7F5EF) over faint lat/long grid;
ink #1E2A38; NOTAM red #C8102E; chart blue #1D5FA8; stamp amber #E8B93B;
clearance green #2E7D4F. Engraved-caps labels (uppercase, +0.14em tracking,
11px) on a workhorse sans; dispatch documents set like a release sheet with
a margin title block. Flat unmodulated state color, no muddy greys, no
gradients. Motion overshoots ~0.4s and settles.

STORY: The user understands at a glance which expeditions are cleared,
which are still being flight-planned, and what departs today; believes the
plan because every guess is filed as a NOTAM they can override; acts by
dumping, vetoing assumptions, and checking off legs.

FIRST VIEWPORT: Left rail (Manifest / Dispatches / Route Profile /
Briefs) on paper ground; main panel lists projects as dispatch cards —
title, status stamp (FLIGHT PLANNED / EN ROUTE / CLEARED), summit ETA —
with a NOTAM count badge on any card carrying unreviewed assumptions;
beneath, a route-profile strip draws the scheduled legs scale-true.
Primary action: file a new flight (title-only input, top of rail area).

FORM: Flight Planning world (grounded candidate 1 of 7); user-locked via
decision page over roll assignment (seed a2f5fbae, kind: pick).

FINISH: unreviewed and undocumented is unfinished; this build ends with
the finish review, the verdict, DESIGN.md, and every shipping raster
carrying its provenance.

## Unresolved decisions

- WeeklyCapacity seeded defaults (0 weekends, 4h weekdays) until the user
  sets real numbers in settings.
- Claude model pinned to a current sonnet in lib/planner.ts.
