# Bounded design/accessibility follow-up

This is a targeted keyboard/navigation/contrast check, **not a full accessibility certification**.

## Keyboard and form behavior

The native modal now also explicitly wraps Tab/Shift+Tab among visible, enabled controls. Playwright verifies Shift+Tab from Close reaches Cancel when confirmation is disabled, and reaches Confirm when enabled; Tab from the last control returns to Close. Escape, Close and Cancel restore focus to the original Record decision trigger. The dialog has an accessible name via `aria-labelledby`.

Decision and Rationale have explicit `label[for]` and matching element IDs. The choice remains neutral until the reviewer selects an outcome. A filled rationale alone cannot enable confirmation.

## Policy navigation and tab strips

Finding citations identify the exact policy ID, title and version. Opening one focuses and highlights the corresponding fictional policy. Return to review preserves the selected campaign/version and restores focus to the citation. The queue/detail tab strips stay on one row with horizontal overflow and hidden vertical overflow. Browser assertions cover these behaviors.

## Measured text contrast

The reproducible `scripts/measure-contrast.mjs` reads computed foreground colors and nearest solid backgrounds in the rendered browser and applies the WCAG relative-luminance contrast formula. It samples visible queue/review secondary text, status/risk labels and guidance. It does not audit every state, every DOM node, screen-reader semantics, contrast over images/transparent layers, or all WCAG criteria.

| Sample set | Samples | Before minimum | Before below 4.5:1 | After minimum | After below 4.5:1 |
| ---------- | ------: | -------------: | -----------------: | ------------: | ----------------: |
| Queue      |      16 |         2.74:1 |                 15 |        5.33:1 |                 0 |
| Review     |      11 |         3.07:1 |                  4 |        5.47:1 |                 0 |

The review baseline was captured after the first shared-secondary-color adjustment, before its remaining link/uncertainty/suggestion fixes. Raw computed colors and ratios are in `docs/contrast/*-before.json` and `*-after.json`.

```sh
node scripts/measure-contrast.mjs --assert
node scripts/measure-contrast.mjs --review --assert
# BASE_URL can point to the deployed app; use the documented test-only TLS
# setting solely when the sandbox browser lacks its network proxy CA.
```

The automated browser suite covers the core loop, workspace scoping, explicit decision selection, focus wrapping/restoration, policy return navigation, and tab overflow. Auth account provisioning and the unconfirmed hosted rollback verification remain separate limitations documented in `VERIFICATION.md`.
