# Fish Upstream Check Audit (2026-07-12)

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

## Newly ported subset files

`count`, `empty`, `command-vars-persist`, `line-continuation`, `scoping`,
`wildcard`, `deep-cmdsub`, `directory-redirect`,
`exit-status-with-closing-stderr` — see `test/spec/fish/*.subset.test.ts`;
each header records its reductions.

Extended existing ports: `loops` (loop-variable scoping, reduced from
`set --show`), `redirect` (output redirect on a recursive function call),
`return` (negative status sweep), `string` (replace first/all semantics).

## Deferred gaps and recorded divergences

These are in-scope-adjacent behaviors where shfs deliberately or currently
diverges. No failing tests are committed for them.

| Behavior | Upstream evidence | shfs today | Disposition |
| --- | --- | --- | --- |
| `echo` flags `-n`/`-s`/`-e`/`-E` | `count.fish:46`, `basic.fish`, many | printed literally | Out of scope (boundary); revisit — `echo -n` is common |
| Backslash escape sequences (`\n`, `\xHH`, `\uXXXX`) in words | `locale.fish:31-36`, `line-continuation.fish:14-21` | backslash drops, char kept literally | Divergence; candidate for lexer support |
| Quoted PATH-like expansion joins with `:` and maps empty elements to `.` | `colon-delimited-var.fish` | joins with spaces | Divergence; PATH special-casing only exists for assignment prefixes |
| Variables as command names (`$CMD`) and empty-command status 123 | `vars_as_commands.fish`, `status-value.fish:3-8` | deterministic compile error `command-name-not-literal` | Decision: command names are literal in shfs |
| Fish-exact failure statuses 121 (bad expansion), 124 (glob no-match) | `status-value.fish` | deterministic errors with status 1 | Decision: stable error model, not fish-verbatim |
| `test` POSIX zero/one-argument modes (`test foo` → 0) | `test-posix.fish` | missing-operand error | Decision: shfs follows fish's `test-require-arg` future semantics |
| Quoted keywords (`'if' true ... end`) | `line-continuation.fish:23-27` | parse error | Out of scope |
| Command substitution depth ≥ 64 | `deep-cmdsub.fish` | deterministic `max-substitution-depth` parse error at depth 10 | Decision: bounded nesting; asserted in the new subset file |
| Glob results keep a literal `./` prefix | `wildcard.fish:9` | normalized away | Cosmetic divergence, noted in the subset file |
| `$pipestatus` | `pipestatus.fish` | empty | Out of scope (boundary) |

## Classification of all upstream check files

Ported before this audit (23, re-audited; extensions noted above):
`andandoror`, `andor`, `basic`, `cd`, `cmdsub`, `disown-parent`,
`expansion`, `fish_add_path`, `for`, `function-definition`, `function`,
`glob`, `loops`, `not`, `read`, `redirect`, `return`, `set`, `slices`,
`string`, `test`, `variable-assignment`, `zero_based_array`.
Small/medium files were re-read in full (`andor`, `cmdsub`, `for`,
`function-definition`, `loops`, `not`, `redirect`, `return`,
`variable-assignment`, `zero_based_array`); the large files (`basic`, `cd`,
`expansion`, `function`, `read`, `set`, `string`, `test`, `glob`,
`andandoror`, `slices`, `fish_add_path`, `disown-parent`) were
spot-checked against their local ports, which are recent and organized by
upstream case.

Newly ported (9): `count`, `empty`, `command-vars-persist`,
`line-continuation` (partial: escape-spelled keywords out of scope),
`scoping` (partial: `-U`/`-x`/`-u` out of scope), `wildcard` (partial:
permission traversal out of scope), `deep-cmdsub` (reduced), 
`directory-redirect` (reduced), `exit-status-with-closing-stderr`
(reduced).

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
(`$fish_read_limit`), `colon-delimited-var` (divergence recorded above),
`features-ampersand-nobg-in-token1`, `features-ignore-terminfo`,
`features-nocaret1`, `features-nocaret2`, `features-nocaret3`,
`features-nocaret4`, `features-percent-self1`, `features-percent-self2`,
`features-qmark1`, `features-qmark2`, `features-string-backslashes`,
`features-string-backslashes-off`, `line-number`, `locale`,
`locale-numeric`, `message-localization`,
`message-localization-tier-is-declared`, `stack-overflow`,
`string-advanced` (regex modes), `switch`, `symlinks-not-overwritten`,
`syntax-error-location`, `test-posix` (decision recorded above),
`status-value` (divergence recorded above), `vars_as_commands`
(divergence recorded above).

## Follow-ups worth considering

1. `echo -n` (and possibly `-s`) — the most common in-scope-adjacent echo
   usage in upstream checks; adding it would unlock many reductions.
2. Lexer escape sequences (`\n`, `\xHH`) — used pervasively upstream.
3. `string match -r`/`string replace -r` regex modes — the largest string
   surface still missing.
4. `switch`/`case` — the only control-flow keyword still excluded.
