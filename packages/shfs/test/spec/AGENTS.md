# notes on spec tests

- Each test is derived from an external source outlined in their folders AGENTS.md.
- This approach gives us an expansive reference that is narrowed instead of starting from scratch.
- Only adapted external-source tests belong under `spec/`; project-native regression tests should live with the implementation they cover, such as under `builtin/`, `operator/`, `execute/`, or `shell/`.
- Organize file-oriented upstream suites one upstream file per local test file. Use a mechanical, documented filename mapping when repository lint prevents preserving the upstream basename exactly.
- Split adaptations that draw from different upstream files instead of combining their cases in one local test file.

- DO NOT cater tests to current implementation when writing tests.

## test labels

Use this shape for test labels:

`<area>: <case-id> - <expected behavior>`

- `<area>` should be `fish ...` or `gnu ...`, such as `fish glob` or `gnu grep`.
- `<case-id>` should prefer the original upstream filename when available, including extensions like `.fish`, `.sh`, `.pl`, or `.exp`.
- A test label must name the single upstream file represented by its local test file.
