# Local Lab design direction

## Physical scene and theme

A person sits at a kitchen table in daylight, opening a work file and wanting a quick, understandable result. Use a light paper-toned workspace with dark readable text and a restrained pine-green action color.

## Layout

A compact navigation rail and a central analytics workspace. Lead with the question and selected CSV. Group required measure/comparison settings; disclose optional date, filter and negative-value settings. Results lead with metrics and a dominant trend chart. Retail reports and model improvement are separate disclosures below the result. Keep agent receipts in optional details, with concise device activity visible. Collapse navigation and stack panels on small screens. No explanatory rail, taglines or repeated page labels.

## Color tokens

Use OKLCH: background oklch(0.974 0.006 95), surface oklch(0.995 0.004 95), text oklch(0.25 0.016 160), muted oklch(0.49 0.012 160), border oklch(0.87 0.012 110), accent oklch(0.44 0.075 157), accent-soft oklch(0.93 0.025 157). Amber is reserved for caution/preview status.

## Typography and shape

System sans-serif with 14–16 px body text, 12 px labels and a 32 px main heading. Medium-weight labels, tabular numerals for measured values, 8–12 px radii and thin full borders. No external fonts or remote assets.

## States and copy

Use actual connection and job states: downloading, queued, running, evaluating, ready, failed and cancelled. Only fictional sample data carries a sample badge. Never invent progress or model results. Keep native field labels and actionable errors. Use layout and disclosure to explain workflow boundaries; preserve data provenance and training limits as structured facts. Device activity is global, not implicitly scoped to the displayed dashboard. Stable control IDs, semantic current-navigation state and safe text rendering serve users, developers and agents.

## Motion and accessibility

Short color/opacity transitions only; honor prefers-reduced-motion. Native labelled file input and buttons, aria-live feedback, semantic headings and visible focus. Explain the output in words, never color alone.
