# Local Lab design direction

## Physical scene and theme

A person sits at a kitchen table in daylight, opening a work file and wanting a quick, understandable result. Use a light cool-gray workspace with dark readable text and a restrained blue action color.

## Layout

A compact navigation rail and one coherent task surface. Creating reusable tools is primary. Initial setup asks for the purpose and a selected CSV; column mapping is disclosed unless required. Review shows purpose, filename, actual expected downloads and file handling before Create tool. Technical selection and training evidence are under Details.

Create immediately replaces setup in place with current on-device progress and a stable Stop control, including while the creation acknowledgement or queue is pending. Use four real phases: check the starting model, learn from examples, test the result, save. Show counts only when backend state supplies a phase-local count. No overall completion bar or guessed ETA. Replace raw worker text with a bounded plain-language phase; retain the raw evidence under Details.

Ready leads to Open saved tool. Stopped, interrupted, failed and disconnected states explain the safe next step. An unknown creation acknowledgement must lead to checking saved tasks rather than an automatic duplicate request. A saved tool puts Ask your saved tool and its latest answer first. Diagnostic Activity is secondary. Use the actual native Mac viewport as the layout baseline.

## Color tokens

Use OKLCH: background oklch(.98 .003 245), surface oklch(.997 .002 245), text oklch(.27 .018 245), muted oklch(.49 .018 245), border oklch(.89 .009 245), accent oklch(.46 .085 245), accent-soft oklch(.94 .025 245). Amber is reserved for caution.

## Typography and shape

System sans-serif with 14–16 px body text, 12 px labels and a 32 px main heading. Medium-weight labels, tabular numerals for measured values, 8–12 px radii and thin full borders. No external fonts or remote assets.

## States and copy

Use actual connection and job states: downloading, queued, running, evaluating, ready, failed and cancelled. Only fictional sample data carries a sample badge. Never invent progress or model results. Keep native field labels and actionable errors. Use layout and disclosure to explain workflow boundaries; preserve data provenance and training limits as structured facts. Workspace Activity follows the selected task. The separate Monitor and explicitly labelled device queue counts remain global. Stable control IDs, semantic current-navigation state and safe text rendering serve users, developers and agents.

## Motion and accessibility

Short color/opacity transitions only; honor prefers-reduced-motion. Native labelled file input and buttons, aria-live feedback, semantic headings and visible focus. Explain the output in words, never color alone.

## Creation status and motion

Lead with one live status: a small Step N of 4 label only during active work, one plain-language heading, one helpful sentence, actual current-step progress when available, and a visible Stop. Queued requests say Waiting to start and never mark a step active. Hide the numbered workflow under View all steps; its rows are explanatory, not radio controls. Keep diagnostics separately under Details.

Motion marks a meaningful state change with a brief opacity/4px transform transition. Count-only polls never replay that transition or replace controls. A thin bar moves only to a real current-step count, with an immediate reset between steps; no overall percentage, ETA, looping spinner or idle motion. Stopping and terminal copy replace active work immediately. Reduced motion skips status transitions and bar easing while retaining all information.
