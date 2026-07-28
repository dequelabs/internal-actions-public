# bundle-size-budget

Compare a flat size-map JSON against absolute **headroom** limits and a
**baseline** for significant per-PR regressions.

Callers own building the project and emitting the size map. This action only
reads JSON and fails the job when budgets are breached.

## Size-map contract

A JSON object of `name → bytes`:

```json
{
  "app.bundle.js": 2457600,
  "packages/core/dist/index.js": 9120
}
```

Optional limits map (same key space):

```json
{
  "app.bundle.js": 7340032,
  "packages/core/dist/index.js": 10240
}
```

Two properties of the key space matter:

- **Keys must be stable across builds.** The regression check looks each current
  key up in the baseline, so content-hashed asset names (`app.a1b2c3.js`) never
  match and the check silently reports "no significant increases" forever. Strip
  the hash when emitting the map, or key off the logical entrypoint name.
- **Both checks only iterate the keys in `current-path`.** Neither an aggregate
  nor a removed asset is inferred for you:
  - To budget the whole bundle rather than individual assets — twenty assets each
    growing 100 KB breaches nothing per-key — emit a synthetic `total` key. It
    gets a headroom limit and a regression check like any other key.
  - Keys tracked in `limits-path` or the baseline but absent from `current-path`
    (a rename, a dropped asset) are unenforced. The action warns and lists them
    in the summary rather than failing, so a stale limit is visible instead of
    quietly passing.

## Checks

1. **Headroom** (when `max-bytes` and/or `limits-path` is set)
   - Fail when `size >= limit`
   - Warn (no fail) when `size >= limit * warn-ratio`
2. **Regression** (when baseline is readable)
   - Fail when growth is ≥ `min-increase-bytes` **and** ≥ `max-increase-ratio` of the baseline size
   - New keys (present in current, absent from baseline) are ignored for regression
3. Missing baseline soft-skips regression unless `fail-on-missing-baseline` is `true`. Headroom still runs.

Findings are written to the job log and `$GITHUB_STEP_SUMMARY`.

## Inputs

| Name                       | Required | Default | Description                                                                              |
| -------------------------- | -------- | ------- | ---------------------------------------------------------------------------------------- |
| `current-path`             | Yes      | —       | Path to the current sizes JSON                                                           |
| `baseline-path`            | No       | —       | Path to the baseline sizes JSON (may be missing; omit for headroom only)                 |
| `max-increase-ratio`       | No       | `0.1`   | Fraction of baseline size that counts as a significant increase                          |
| `min-increase-bytes`       | No       | `150kb` | Absolute growth required before a regression fails (`b`/`kb`/`mb`/`gb` or plain integer) |
| `fail-on-missing-baseline` | No       | `false` | Fail when baseline cannot be read                                                        |
| `warn-ratio`               | No       | `0.85`  | Fraction of the absolute limit that triggers a warning                                   |
| `max-bytes`                | No       | —       | Uniform absolute limit for every current key                                             |
| `limits-path`              | No       | —       | Per-key limits JSON; overrides `max-bytes` for matching keys                             |

If neither `max-bytes` nor `limits-path` is set, headroom is skipped. If
`baseline-path` is omitted, regression is skipped.

A regression needs the ratio **and** the absolute threshold, so scale
`min-increase-bytes` to what you are measuring. The `150kb` default suits an
application bundle; against a 10 KB library entrypoint it can never be met, which
disables the check. Set it to something like `2kb` for per-package budgets.

## Example: Actions-cache baseline

Restore the cached baseline first (same `path` that was saved), then emit the
current map to a different filename so restore does not overwrite it. Adjust
branch names and cache key prefixes to match the repo.

```yaml
bundle_budget:
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Restore bundle baseline
      uses: actions/cache/restore@v4
      with:
        path: bundle-sizes.json
        key: bundle-baseline-${{ github.sha }}
        restore-keys: bundle-baseline-
    - name: Build and emit current sizes
      run: |
        pnpm run build
        node scripts/emit-bundle-sizes.js --out current-bundle-sizes.json
    - name: Check bundle budget
      # Keep max-bytes aligned with any hard ceiling enforced elsewhere in the build.
      uses: dequelabs/internal-actions-public/.github/actions/bundle-size-budget@main
      with:
        current-path: current-bundle-sizes.json
        baseline-path: bundle-sizes.json
        max-bytes: 7mb
        warn-ratio: '0.85'

bundle_baseline:
  if: github.event_name == 'push' && github.ref_name == github.event.repository.default_branch
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - name: Build and emit sizes
      run: |
        pnpm run build
        node scripts/emit-bundle-sizes.js --out bundle-sizes.json
    - name: Save bundle baseline
      uses: actions/cache/save@v4
      with:
        path: bundle-sizes.json
        key: bundle-baseline-${{ github.sha }}
```

## Adoption patterns

Callers emit the size map however their build works. Common approaches:

- **Bundler stats** — parse the bundler’s stats JSON into `name → bytes`, then pass a uniform `max-bytes` (or a per-asset `limits-path`) that matches any hard ceiling already enforced at build time.
- **Published package / library budgets** — emit sizes for the same paths your absolute budget tool already tracks; use `limits-path` for per-entry headroom and keep the existing absolute tool if you still want it as a separate gate. Lower `min-increase-bytes` to match the scale of the entries, or the regression half of the check will never fire.
- **Single artifact** — emit one key (for example the built binary or server bundle) and pass the same absolute cap as `max-bytes`.

In all cases, cache the size map on the default branch and restore it on pull requests for the regression check.

## Local development

```bash
pnpm install
pnpm --filter bundle-size-budget run test
pnpm --filter bundle-size-budget run build
```
