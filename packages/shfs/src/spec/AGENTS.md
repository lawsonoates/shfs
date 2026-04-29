# notes on spec tests

- Each test is derived from an external source outlined in their folders AGENTS.md.
- This approach gives us an expansive reference that is narrowed instead of starting from scratch.

- DO NOT cater tests to current implementation when writing tests.

## test labels

Use this shape for test labels:

`<area>: <case-id> - <expected behavior>`

- `<area>` should be `fish ...` or `gnu ...`, such as `fish glob` or `gnu grep`.
- `<case-id>` should prefer the original upstream filename when available, including extensions like `.fish`, `.sh`, `.pl`, or `.exp`.
- If one test covers multiple upstream files, join the filenames with ` + `.
