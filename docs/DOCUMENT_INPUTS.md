# Local document inputs

CSV keeps its existing trusted-calculation dashboard path and 500 MB upload limit. Other files use `/api/files`, stored under generated IDs in ignored `.local-lab/documents/`. Original bytes are preserved; extracted text is a separate local file. No raw content enters hosted Relay. This directory is not an OS sandbox.

Supported: UTF-8 plain text (including Markdown, JSON, YAML, XML, HTML, logs, TSV and source code), text-based PDF, DOCX, and XLSX. Uploaded source code is only text; no macros, formulas, links or code are executed. Excel extraction identifies cell references and marks formula values as cached. Workbook answers are model interpretations, not the trusted CSV analytics engine.

PDF requires `pypdf` in the companion's `python3` environment. Missing readers, encrypted PDFs, scanned pages without text, invalid archives, binary files and oversized content produce explicit errors. Images/audio/video need separate compatible models and are not supported by the installed text model.

Limits: 10 MB upload, 24,000 extracted characters, 100 PDF pages, 20 MB total expanded ZIP size, 5 MB per XML member, 1,000 archive entries and 20-second extraction timeout. No silent truncation. Extractors are trusted fixed commands, never model-written commands.

Document jobs use the Device reservation and pinned task context. Short sources are answered directly; longer sources use bounded source quotes and final synthesis. Failed quote/context guards fail the job. Short Webb acceptance passed; reliable long-document synthesis remains unproven. See [PDF acceptance](PDF_SUMMARIZATION_ACCEPTANCE.md). Results and follow-up tasks persist locally; model answers are not verified calculations.

Verified with text/DOCX/PDF/XLSX fixtures, binary/size/entity rejection, UTF-8 chunk boundaries, frontend upload tests and a real uploaded Markdown → queued Qwen3 answer. No browser automation was used for this feature.
