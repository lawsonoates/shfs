# Fish Upstream Check Audit (2026-07-12, follow-ups completed 2026-07-15)

This document records a full audit of every file in fish-shell
`tests/checks/` (master snapshot in the opensrc cache, 208 check scripts)
against the shfs subset boundary. It follows
`docs/execution-boundary-audit.md` and the refreshed boundary decision in
`notes/shfs-subset-boundary.md` (rewritten as part of this audit — the
previous revision omitted pipelines/redirection, the filesystem commands,
and shell-state persistence entirely).

Methodology:

1. The boundary was re-derived from the implementation (compiler grammar,
   command registry, builtins) and a ~110-case runtime probe battery, then
   the boundary note was rewritten.
2. Every upstream check file was classified: ported, newly ported, partially
   reducible, or out of scope with the boundary section that excludes it.
3. For in-scope gaps, tests were run red first where they exposed real
   divergences; small fixes were applied, larger ones recorded below as
   deferred gaps.

## Fixes applied during this audit

| Contract | Upstream evidence | Fix |
| --- | --- | --- |
| Empty function resets `$status` to 0 | `empty.fish:5-16` | `runFunctionCall` sets status 0 before the body |
| `count` adds stdin records to argument count | `count.fish:40-43` | registry `count` handler always drains piped input |
| `string replace` replaces first occurrence; `-a/--all` for all; status 1 when nothing replaced | `string.fish:499-505` | `string.ts` replace |
| Top-level unscoped `set`/`read` create globals (persist across invocations) | `command-vars-persist.fish`, fish `set.rst:133-135` | `setVariable` auto-scope fallback |
| One unmatched glob product does not fail a multi-product expansion | `wildcard.fish:3-13` | `expandGlobProductsEffect` fails only when no product matches |
| Negative `return` values never map to status 0 | `return.fish:145-156` | `runReturnStatement` maps `-256` multiples to 255 |

Applied during the 2026-07-13 line-by-line re-read of the large files
(each confirmed against a runtime probe before the fix, red-first through
the extended subset tests):

| Contract | Upstream evidence | Fix |
| --- | --- | --- |
| `return` above 255 clamps to 255 (was mod-256 → `return 300` gave 44) | `basic.fish:118-127` | `runReturnStatement` clamps positives |
| `read` rejects read-only variable names (`read status` silently succeeded) | `read.fish:391-398` | `read.ts` guards with `isReadOnlyVariable` |
| `set -a`/`-p` on a slice is an error (was silently ignored) | `set.fish:641-652` | `runAssign` rejects append/prepend with an index |
| `set -a -p name v...` prepends **and** appends (only appended before) | `set.fish:614-626` | `runAssign` builds `[prepend, current, append]` |
| `function -a status` is rejected as read-only (was accepted) | `function.fish:160-176` | parser `validateArgumentName` |
| A function redefined by a substitution in its own arguments is resolved after expansion (`foo (function foo; ...)` ran the old body) | `function.fish:182-186` | `call` step looks up the definition after expanding arguments |

## Follow-up implementations (2026-07-15)

The worthwhile candidates identified below were implemented from upstream
tests and documentation in three focused changes:

- Fish word escapes, comment-aware substitution scanning, quoted PATH-like
  rendering, nested/index-bound expansion, malformed index diagnostics, and
  invalid undefined-variable erase slices.
- `switch`/`case` parsing, compilation, runtime matching, scope, status, and
  deterministic diagnostics.
- Fish-style `echo` flags and escapes; regex `string match`/`replace`;
  `split0` and split-aware substitutions; exact byte/line handling through
  pipelines, redirection, child commands, file replay, shared stdin, and
  partial `head` consumption.

## Newly ported subset files

`count`, `empty`, `command-vars-persist`, `line-continuation`, `scoping`,
`wildcard`, `deep-cmdsub`, `directory-redirect`,
`exit-status-with-closing-stderr`, `colon-delimited-var`, `locale`,
`string-advanced`, and `switch` — see `test/spec/fish/*.subset.test.ts`;
each header records its reductions.

Extended existing ports: `loops` (loop-variable scoping, reduced from
`set --show`), `redirect` (output redirect on a recursive function call),
`return` (negative status sweep), `string` (replace first/all semantics).

## Deferred gaps and recorded divergences

These are in-scope-adjacent behaviors where shfs deliberately or currently
diverges. No failing tests are committed for them.

| Behavior | Upstream evidence | shfs today | Disposition |
| --- | --- | --- | --- |
| Variables as command names (`$CMD`) and empty-command status 123 | `vars_as_commands.fish`, `status-value.fish:3-8` | deterministic compile error `command-name-not-literal` | Decision: command names are literal in shfs |
| Fish-exact failure statuses 121 (bad expansion), 124 (glob no-match) | `status-value.fish` | deterministic errors with status 1 | Decision: stable error model, not fish-verbatim |
| `test` POSIX zero/one-argument modes (`test foo` → 0) | `test-posix.fish` | missing-operand error | Decision: shfs follows fish's `test-require-arg` future semantics |
| Quoted keywords (`'if' true ... end`) | `line-continuation.fish:23-27` | parse error | Out of scope |
| Command substitution depth ≥ 64 | `deep-cmdsub.fish` | deterministic `max-substitution-depth` parse error at depth 10 | Decision: bounded nesting; asserted in the new subset file |
| Glob results keep a literal `./` prefix | `wildcard.fish:9` | normalized away | Cosmetic divergence, noted in the subset file |
| `$pipestatus` | `pipestatus.fish` | empty | Out of scope (boundary) |

Recorded during the 2026-07-13 re-read (probed; left as divergences):

| Behavior | Upstream evidence | shfs today | Disposition |
| --- | --- | --- | --- |
| `set -q` with no names / names expanding to nothing → status 255 | `set.fish:942-948` | compile error (status 1) / status 1 | Decision: deterministic error model |
| Variable-derived `for` variable names (`for $var1 in ...`) | `basic.fish:463-469` | compile error | Decision: names are literal, matches `vars_as_commands` |
| Bare `read` with no variable name is accepted | `read.fish:3` | `read` requires exactly one name | Decision: boundary (`read NAME`) |

## Classification of all upstream check files

Ported before this audit (23, re-audited; extensions noted above):
`andandoror`, `andor`, `basic`, `cd`, `cmdsub`, `disown-parent`,
`expansion`, `fish_add_path`, `for`, `function-definition`, `function`,
`glob`, `loops`, `not`, `read`, `redirect`, `return`, `set`, `slices`,
`string`, `test`, `variable-assignment`, `zero_based_array`.
All ported files have now been re-read in full. The small/medium files
(`andor`, `cmdsub`, `for`, `function-definition`, `loops`, `not`,
`redirect`, `return`, `variable-assignment`, `zero_based_array`) were
re-read during the initial audit; the large files (`basic`, `cd`,
`expansion`, `function`, `read`, `set`, `string`, `test`, `glob`,
`andandoror`, `slices`, `fish_add_path`, `disown-parent` — ~5,300 upstream
lines) were re-read line-by-line on 2026-07-13 with a ~75-case probe
battery against every in-scope behavior not already asserted by a port.
That pass produced the six fixes above, the extra recorded divergences,
and extensions to the `basic`, `cd`, `expansion`, `function`, `read`,
`set`, `slices`, and `string` subset files (out-of-range slice and
empty-list indexing, zero-index errors, escaped newlines and comment
placement, `set` append/prepend and index-erasure semantics,
`string lower`/`upper` and `sub` clamping, `repeat` error cases,
read-only-variable enforcement across `set`/`read`/`for`/`function -a`).
`glob`, `test`, `andandoror`, `fish_add_path`, and `disown-parent` needed
no changes — their ports already covered every in-scope upstream case.

Newly ported (13): `count`, `empty`, `command-vars-persist`,
`line-continuation` (partial: escape-spelled keywords out of scope),
`scoping` (partial: `-U`/`-x`/`-u` out of scope), `wildcard` (partial:
permission traversal out of scope), `deep-cmdsub` (reduced),
`directory-redirect` (reduced), `exit-status-with-closing-stderr`
(reduced), `colon-delimited-var` (quoted rendering subset), `locale`
(escape subset), `string-advanced` (regex subset), and `switch`.

Out of scope — interactive terminal sessions (tmux-driven):
`tmux-abbr`, `tmux-autosuggestion`, `tmux-autosuggestion-multiline`,
`tmux-autosuggestion-multiline-resizing-prompt`,
`tmux-autosuggestion-multiline-resizing-window`, `tmux-bind`, `tmux-bind2`,
`tmux-breakpoint`, `tmux-commandline`, `tmux-complete`, `tmux-complete2`,
`tmux-complete3`, `tmux-complete4`, `tmux-empty-prompt`,
`tmux-first-prompt`, `tmux-fish_config`, `tmux-history-pager`,
`tmux-history-search`, `tmux-history-search2`, `tmux-invocation`,
`tmux-job`, `tmux-multiline-prompt`, `tmux-omitted-newline`, `tmux-pager`,
`tmux-prefix`, `tmux-prompt`, `tmux-read`, `tmux-repaint`,
`tmux-reporting`, `tmux-right-prompt`, `tmux-scrollback`, `tmux-set`,
`tmux-signal`, `tmux-source`, `tmux-transient-prompt`,
`tmux-vi-key-bindings`, `tmux-wrapping`.

Out of scope — completion, bindings, and command-line UI: `abbr`, `alias`,
`bind`, `breakpoint`, `check-completions`, `commandline`,
`complete`, `complete-cygwin`, `complete-group-order`,
`complete_directories`, `completion-autoload-tombstone`,
`fish_key_reader`, `fish_vi_key_bindings`, `funced`, `help-completions`,
`history`, `prompt`, `vi`.

Out of scope — job control and signals: `bg`, `disown`, `fg`,
`job-control-noninteractive`, `job-control-not-a-tty`, `job-ids`, `jobs`,
`jobs-are-escaped`, `self-signal-usr1`, `sigint`, `sigint2`, `signal`,
`threads`, `trap`, `trap_print`, `wait`.

Out of scope — external processes and host behavior: `command-1`,
`command-2`, `command-not-found`, `env`, `exec`, `fds` (fish_test_helper
introspects real OS descriptors; the in-scope `>&-`/`<&-`/`N<file` routing
forms are covered by `redirect.subset.test.ts`), `git`, `invocation`,
`man`, `no-execute`, `noshebang`, `nuls` (printf/NUL escapes),
`output-buffering`, `pipeline-pgroup`, `pipestatus`, `psub`,
`rc-returned` (its status contract is covered by shell-status tests),
`time`.

Out of scope — startup, config, and environment: `__fish_macos_set_env`,
`__fish_posix_shell`, `__fish_theme_migrate`,
`__fish_tried_to_embed_manpages`, `autoload`, `broken-config`,
`config-paths`, `create-base-directories`, `default-setup-path`,
`fish_user_paths`, `init-command`, `init-command-2`, `init-command-mix`,
`init-command-mix-ordering`, `init-unreadable-config-paths`,
`init-unreadable-cwd`, `no-config`, `xdg-data-dirs-default` (its
assignment-prefixed invocation contract is covered by
`variable-assignment.subset.test.ts`).

Out of scope — fish distribution tooling and repository checks:
`build-info`, `check-all-fish-files`, `fish_config`, `fish_delta`,
`fish_update_completions`, `indent`, `manpage-completions-groff-x`,
`po-files-well-formed`, `print-help`, `python-user-facing-tools-compat`,
`regex-import`, `sphinx-html`, `sphinx-man`, `sphinx-markdown-changelog`,
`vcs-prompts`.

Out of scope — builtins excluded by the boundary: `argparse`,
`builtinbuiltin`, `caller-exit`, `caller-observer`, `contains_opt`,
`eval`, `export`, `fish_exit`, `functions`, `math`, `path`, `printf`,
`random`, `realpath`, `set_color`, `setenv`, `source`, `status`,
`status-command`, `trace`, `type`, `ulimit`, `umask`, `version`, `wraps`.

Out of scope — language features and diagnostics excluded by the boundary:
`bad-option`, `braces` (brace blocks and brace expansion), `cmdsub-limit`
(`$fish_read_limit`),
`features-ampersand-nobg-in-token1`, `features-ignore-terminfo`,
`features-nocaret1`, `features-nocaret2`, `features-nocaret3`,
`features-nocaret4`, `features-percent-self1`, `features-percent-self2`,
`features-qmark1`, `features-qmark2`, `features-string-backslashes`,
`features-string-backslashes-off`, `line-number`, `locale-numeric`,
`message-localization`,
`message-localization-tier-is-declared`, `stack-overflow`,
`symlinks-not-overwritten`, `syntax-error-location`, `test-posix` (decision recorded above),
`status-value` (divergence recorded above), `vars_as_commands`
(divergence recorded above).

## Follow-up status

All four candidates previously listed here—`echo` flags, lexer escapes,
regex string modes, and `switch`/`case`—are implemented. Remaining deliberate
differences are recorded in the tables above and in the subset boundary.
