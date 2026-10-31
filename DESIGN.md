# Local Lab design direction

## Physical scene and theme

A person sits at a kitchen table in daylight, opening a work file and wanting a quick, understandable result. Use a light paper-toned workspace with dark readable text and a restrained pine-green action color.

## Layout

A desktop app shell with a compact left navigation rail, a generous central task/setup workspace and a narrow right-hand setup explanation. Lead with a sentence-sized task input. Offer two selectable recipe rows: candy recognition and data analytics. Avoid an endless uniform card grid. Collapse navigation and stack panels on small screens.

## Color tokens

Use OKLCH: background oklch(0.974 0.006 95), surface oklch(0.995 0.004 95), text oklch(0.25 0.016 160), muted oklch(0.49 0.012 160), border oklch(0.87 0.012 110), accent oklch(0.44 0.075 157), accent-soft oklch(0.93 0.025 157). Amber is reserved for caution/preview status.

## Typography and shape

System sans-serif with 14–16 px body text, 12 px labels and a 32 px main heading. Medium-weight labels, tabular numerals for measured values, 8–12 px radii and thin full borders. No external fonts or remote assets.

## States and copy

The first screen is a designed empty state. The persistent badge says Design preview. Primary action says Preview setup. Never display invented training metrics or claim files were processed. A real implementation adds downloading, queued, running, evaluating, ready, failed and cancelled states. Put agent details behind an optional activity view.

## Motion and accessibility

Short color/opacity transitions only; honor prefers-reduced-motion. Native labelled file input and buttons, aria-live feedback, semantic headings and visible focus. Explain the output in words, never color alone.
