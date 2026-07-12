# Fish Discrepancies

This inventory compares `shfs` with upstream fish-shell `tests/checks` from
`/home/lawson/.opensrc/repos/github.com/fish-shell/fish-shell/master`, inspected
on 2026-07-07. It only lists behavior fish has that `shfs` is missing or only
partially implements.

For the follow-up audit of interactions across functions, blocks, pipelines,
substitutions, and child commands, see `docs/execution-boundary-audit.md`.

> **Update 2026-07-08**: the fish scripting subset landed, resolving items
> 1-6 and large parts of 7, 10, 19, 21, and 22: `&&`/`||`, `not`/`!`,
> `begin`/`if`/`while`/`for` blocks, functions with `$argv`/`return`,
> command-scoped assignments, list variables with slices, `$()` command
> substitution (including inside double quotes), the `[` alias with
> string/numeric/file `test` predicates, more `string` subcommands
> (`length`, `sub`, `split`, `join`, `trim`, `repeat`, `lower`, `upper`),
> and the `true`/`false`/`count` builtins. See
> `notes/shfs-subset-boundary.md` for the current boundary. The remaining
> items below (universal/exported variables, brace expansion, `switch`,
> job control, external processes, interactive UX, fish-exact diagnostics,
> and so on) stay out of scope.

Local `shfs` fish-derived coverage directly ports 23 of 208 upstream check
scripts: `andandoror.fish`, `andor.fish`, `basic.fish`, `cd.fish`,
`cmdsub.fish`, `disown-parent.fish`, `expansion.fish`, `fish_add_path.fish`,
`for.fish`, `function-definition.fish`, `function.fish`, `glob.fish`,
`loops.fish`, `not.fish`, `read.fish`, `redirect.fish`, `return.fish`,
`set.fish`, `slices.fish`, `string.fish`, `test.fish`,
`variable-assignment.fish`, and `zero_based_array.fish`. Those ports are subset
ports, not full parity ports.

1. `&&` and `||` command combiners are missing. `shfs` supports `; and` and
   `; or`, but not symbolic combiners, continuation after combiners, or use of
   symbolic combiners inside fish blocks. Evidence: `andandoror.fish`,
   `andor.fish`, `braces.fish`.

2. Command negation is missing. Fish supports `not` and `!` in command position
   and with combiners; `shfs` treats them as unknown commands or words. Evidence:
   `andandoror.fish`, `not.fish`.

3. Compound command and block syntax is missing. Fish supports `begin ... end`
   and brace command blocks such as `{ echo hi; }`, including redirection,
   pipeline, timing, backgrounding, and scoping behavior on blocks. Evidence:
   `andandoror.fish`, `andor.fish`, `braces.fish`, `scoping.fish`.

4. Control flow is missing. Fish has `if`/`else if`/`else`, `while`, `for`,
   `switch`/`case`, `break`, and loop-specific scoping/status behavior. Evidence:
   `andandoror.fish`, `andor.fish`, `for.fish`, `loops.fish`, `switch.fish`,
   `set.fish`.

5. Function support is missing. Fish has function definitions, `$argv`, return
   status, function-local scope, autoloading, event handlers, wrapping, erasing,
   listing, caller metadata, and function editing. Evidence:
   `function-definition.fish`, `function.fish`, `functions.fish`,
   `autoload.fish`, `funced.fish`, `wraps.fish`, `caller-exit.fish`,
   `caller-observer.fish`, `return.fish`.

6. Command-scoped variable assignment is missing. Fish supports
   `name=value command`, assignment before blocks/control structures, PATH-like
   splitting, and assignment-aware completion. Evidence:
   `variable-assignment.fish`, `command-vars-persist.fish`,
   `colon-delimited-var.fish`.

7. Fish's list variable model is missing. `shfs` mostly behaves like scalar
   string variables, while fish variables are lists with element counts,
   indexing, ranges, slices, append/prepend, element erase, path-variable
   encoding, and special read-only variables. Evidence: `set.fish`,
   `expansion.fish`, `slices.fish`, `zero_based_array.fish`,
   `colon-delimited-var.fish`, `status-value.fish`.

8. Fish variable scopes and modes are incomplete. Fish has local, global,
   universal, function, exported, unexported, inherited, path, and unpath
   variables, plus query/show/no-event behavior and variable event hooks.
   Evidence: `set.fish`, `export.fish`, `setenv.fish`, `fish_user_paths.fish`,
   `scoping.fish`, `cd.fish`.

9. Expansion forms are incomplete. Fish supports brace expansion, variable
   slicing/indexing, indirect expansion, tilde/home expansion, expansion
   cartesian products, and detailed empty-list behavior. Evidence:
   `expansion.fish`, `braces.fish`, `slices.fish`, `features-qmark1.fish`,
   `features-qmark2.fish`.

10. Command substitution parity is incomplete. `shfs` supports bare
    parenthesized substitution, but fish also tests `$()` form, substitution
    inside quotes, deep substitution, substitution limits, and exact diagnostic
    behavior. Evidence: `cmdsub.fish`, `deep-cmdsub.fish`,
    `cmdsub-limit.fish`, `expansion.fish`.

11. Process substitution is missing. Fish supports `psub` for temporary
    file-backed process substitution workflows. Evidence: `psub.fish`.

12. Wildcard and feature-flag edge cases are incomplete. `shfs` covers core
    globbing, but fish also tests variable-expanded wildcard lists with partial
    misses, permission-denied traversal, and feature flags around `?`, caret,
    percent-self, ampersand tokenization, and string backslashes. Evidence:
    `wildcard.fish`, `features-qmark1.fish`, `features-qmark2.fish`,
    `features-nocaret1.fish`, `features-nocaret2.fish`,
    `features-nocaret3.fish`, `features-nocaret4.fish`,
    `features-percent-self1.fish`, `features-percent-self2.fish`,
    `features-ampersand-nobg-in-token1.fish`,
    `features-string-backslashes.fish`,
    `features-string-backslashes-off.fish`.

13. Redirection and file-descriptor parity is incomplete. `shfs` has a useful
    subset, but fish also tests directory redirection, broader fd duplication and
    closing behavior, fd-related exit statuses, NUL stream behavior, and many
    process-backed edge cases. Evidence: `redirect.fish`,
    `directory-redirect.fish`, `fds.fish`,
    `exit-status-with-closing-stderr.fish`, `nuls.fish`.

14. Pipeline status and process-group behavior is missing. Fish exposes
    `$pipestatus` and tests pipeline process groups, output buffering, and
    pipeline-specific restrictions on `and`/`or`. Evidence: `pipestatus.fish`,
    `pipeline-pgroup.fish`, `output-buffering.fish`, `andor.fish`.

15. Job control and async process behavior is missing. Fish supports background
    jobs, job ids, `jobs`, `bg`, `fg`, `disown`, `wait`, noninteractive job
    control, TTY-specific behavior, signals, traps, and signal interruption
    semantics. Evidence: `bg.fish`, `fg.fish`, `jobs.fish`, `job-ids.fish`,
    `job-control-noninteractive.fish`, `job-control-not-a-tty.fish`,
    `jobs-are-escaped.fish`, `disown.fish`, `disown-parent.fish`,
    `wait.fish`, `signal.fish`, `sigint.fish`, `sigint2.fish`,
    `trap.fish`, `trap_print.fish`, `self-signal-usr1.fish`.

16. External process execution is missing. Fish resolves and runs host commands;
    `shfs` only runs registered virtual commands. Fish also tests command lookup,
    command-not-found behavior, `exec`, host environment invocation, shebang
    behavior, and external tools used by checks. Evidence: `command-1.fish`,
    `command-2.fish`, `command-not-found.fish`, `env.fish`, `exec.fish`,
    `invocation.fish`, `no-execute.fish`, `noshebang.fish`, `git.fish`,
    `man.fish`.

17. Command resolution helpers are missing. Fish has `alias`, `abbr`, `command`,
    `builtin`, `type`, command wrapping metadata, and related completion
    integration. Evidence: `alias.fish`, `abbr.fish`, `command-1.fish`,
    `command-2.fish`, `builtinbuiltin.fish`, `type.fish`, `wraps.fish`,
    `tmux-abbr.fish`.

18. The completion and command-line UI system is missing. Fish tests completion
    definitions, autoloading, tombstones, group order, directory completion,
    command-line editing, bindings, key reader behavior, pager behavior, vi mode,
    autosuggestions, prompt rendering, and tmux-backed interactive flows.
    Evidence: `complete.fish`, `complete-cygwin.fish`,
    `complete-group-order.fish`, `complete_directories.fish`,
    `check-completions.fish`, `completion-autoload-tombstone.fish`,
    `commandline.fish`, `bind.fish`, `fish_key_reader.fish`,
    `fish_vi_key_bindings.fish`, `history.fish`, `prompt.fish`, `vi.fish`,
    `tmux-complete.fish`, `tmux-complete2.fish`, `tmux-complete3.fish`,
    `tmux-complete4.fish`, `tmux-commandline.fish`, `tmux-bind.fish`,
    `tmux-bind2.fish`, `tmux-history-pager.fish`,
    `tmux-history-search.fish`, `tmux-history-search2.fish`,
    `tmux-pager.fish`, `tmux-prompt.fish`, `tmux-autosuggestion.fish`,
    `tmux-autosuggestion-multiline.fish`,
    `tmux-autosuggestion-multiline-resizing-prompt.fish`,
    `tmux-autosuggestion-multiline-resizing-window.fish`,
    `tmux-vi-key-bindings.fish`.

19. The `set` builtin is incomplete. `shfs` supports a narrow assignment subset;
    fish supports erase, query, show, universal/function scopes, export/unexport,
    append/prepend, path/unpath, slice assignment/erase, special-variable
    validation, inherited-variable display, and detailed option diagnostics.
    Evidence: `set.fish`, `export.fish`, `setenv.fish`.

20. The `read` builtin is incomplete. Fish supports multiple variables, IFS and
    delimiter splitting, arrays/lists, `-n`, `-z`, `-d`, line/null modes,
    tokenization, prompt options, scope/export flags, large-read limits, and
    invalid UTF-8 preservation. Evidence: `read.fish`, `tmux-read.fish`.

21. The `string` builtin is incomplete. `shfs` only covers a small
    `match`/`replace` subset; fish supports `collect`, `escape`, `unescape`,
    `join`, `join0`, `length`, `lower`, `upper`, `pad`, `repeat`, `shorten`,
    `split`, `split0`, `sub`, `trim`, regex groups/indexes, invert/all/max
    flags, NUL behavior, visible-width/color handling, and detailed errors.
    Evidence: `string.fish`, `string-advanced.fish`,
    `features-string-backslashes.fish`.

22. The `test` builtin and `[` alias are incomplete. Fish supports numeric
    comparisons, file predicates, string predicates, date/file identity
    comparisons, `-a`/`-o`, the `[` form, POSIX-oriented behavior, and exact
    invalid-argument diagnostics. Evidence: `test.fish`, `test-posix.fish`,
    `andandoror.fish`.

23. `cd`/`pwd` parity is incomplete. `shfs` supports core navigation, but fish
    also tests `CDPATH`, default home-directory `cd`, `cd -`, `prevd`, `nextd`,
    `pwd -P`/`-L`, imported and repaired `PWD`, physical vs logical navigation,
    PWD variable events, and more symlink edge cases. Evidence: `cd.fish`.

24. Status and introspection builtins are missing or incomplete. Fish has the
    `status` command, status subcommands/values, current filename/line/function
    metadata, stack/caller reporting, trace output, and more exact diagnostic
    locations. Evidence: `status.fish`, `status-command.fish`,
    `status-value.fish`, `line-number.fish`, `trace.fish`,
    `caller-exit.fish`, `caller-observer.fish`,
    `syntax-error-location.fish`.

25. Startup, config, and environment initialization are missing. Fish tests
    startup command ordering, no-config behavior, unreadable cwd/config paths,
    XDG defaults, base directory creation, POSIX-shell environment import,
    user paths, add-path behavior, macOS environment setup, and config tooling.
    Evidence: `init-command.fish`, `init-command-2.fish`,
    `init-command-mix.fish`, `init-command-mix-ordering.fish`,
    `no-config.fish`, `init-unreadable-cwd.fish`,
    `init-unreadable-config-paths.fish`, `config-paths.fish`,
    `xdg-data-dirs-default.fish`, `create-base-directories.fish`,
    `default-setup-path.fish`, `__fish_posix_shell.fish`,
    `__fish_macos_set_env.fish`, `fish_user_paths.fish`,
    `fish_add_path.fish`, `fish_config.fish`.

26. Many fish builtins are absent. Missing command surfaces include `argparse`,
    `contains`, `count`, `eval`, `exit`, `math`, `path`, `printf`, `random`,
    `realpath`, `set_color`, `source`, `time`, `ulimit`, `umask`, and `version`.
    Evidence: `argparse.fish`, `contains_opt.fish`, `count.fish`, `eval.fish`,
    `fish_exit.fish`, `math.fish`, `path.fish`, `printf.fish`,
    `random.fish`, `realpath.fish`, `set_color.fish`, `source.fish`,
    `time.fish`, `ulimit.fish`, `umask.fish`, `version.fish`.

27. Locale, formatting, and terminal-width behavior is missing. Fish tests
    locale-sensitive numeric behavior, display widths, color escape handling,
    and terminal-facing formatting details that `shfs` does not model. Evidence:
    `locale.fish`, `locale-numeric.fish`, `set_color.fish`, `string.fish`,
    `tmux-wrapping.fish`.

28. Fish distribution/tooling commands are missing. The upstream suite includes
    fish-specific tools for configuration, deltas, completion updates, manpage
    generation, docs, embedded manpages, theme migration, and user-facing Python
    helper compatibility. Evidence: `fish_config.fish`, `fish_delta.fish`,
    `fish_update_completions.fish`, `fish_key_reader.fish`,
    `__fish_theme_migrate.fish`, `__fish_tried_to_embed_manpages.fish`,
    `manpage-completions-groff-x.fish`, `help-completions.fish`,
    `print-help.fish`, `sphinx-html.fish`, `sphinx-man.fish`,
    `sphinx-markdown-changelog.fish`, `python-user-facing-tools-compat.fish`.

29. Fish-exact diagnostics are missing. `shfs` intentionally prefers stable
    deterministic errors, but compared to fish it lacks localized messages,
    exact caret spans, help footers, command-not-found explanations, bad-option
    wording, stack-overflow wording, and many parser diagnostics. Evidence:
    `bad-option.fish`, `command-not-found.fish`,
    `syntax-error-location.fish`, `line-number.fish`,
    `message-localization.fish`, `message-localization-tier-is-declared.fish`,
    `stack-overflow.fish`.

30. Binary/NUL stream behavior is incomplete. Fish tests NUL-containing data,
    invalid UTF-8 preservation, null-delimited reads and strings, and exact
    escaping/unescaping behavior. Evidence: `nuls.fish`, `read.fish`,
    `string.fish`.

31. Release/build maintenance checks are not represented. These are not normal
    shell-runtime features, but they are part of the upstream fish check suite
    and have no `shfs` counterpart. Evidence: `build-info.fish`,
    `check-all-fish-files.fish`, `po-files-well-formed.fish`,
    `regex-import.fish`, `threads.fish`, `vcs-prompts.fish`.
