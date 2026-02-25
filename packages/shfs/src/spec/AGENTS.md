# notes on how tests are written

- Each test corresponds to a fish test from the fish-shell repo. i.e. glob.subset.test.ts corresponds to glob.fish
- The fish tests are found locally in opensrc/repos/github.com/fish-shell/fish-shell/tests/checks/
- The tests are a subset of fish which is defined by notes/shfs-subset-boundary.md
- DO NOT cater tests to current implementation

This approach gives us an expansive reference that is narrowed instead of starting from scratch.