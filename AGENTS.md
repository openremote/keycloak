# Notes for agents

Traps that cost real time and are not visible from reading the code. `README.md` covers how
to build and run.

## Before changing the theme: connect the Figma MCP

**The design is the source of truth and it lives in Figma. Check `/mcp` is connected before
touching anything visual. If it is not, say so and stop — do not work from screenshots.**

The designs live in the OR-manager Figma file, in the "Log in pages" section — frames
`OR-login`, `OR-password`, `OR-register`, `OR-2FA` and `OR-code`, plus a third row showing
the same pages under a custom brand. Ask for the link.

Useful calls: `get_metadata` for structure and exact box geometry, `get_design_context` for
real style values and the Vaadin component each node maps to, `get_variable_defs` for the
tokens, `download_assets` with `defaultFormat: "svg"` for logos and icons.

## Design values, from the Figma tokens

They are Lumo names and `@openremote/theme` already resolves them — do not hardcode.

| | |
|---|---|
| body / links / buttons | `lumo-font-size-m` 16px |
| field labels | `lumo-font-size-s` 14px, **weight 500** |
| headings | `lumo-font-size-xl` 22px, weight 600, line-height 1.253 |
| body weight | 400, line-height 1.611 |
| **links and back-arrows** | **weight 500** — they are `<vaadin-button theme="tertiary">`, not anchors, with a `lumo:angle-left` icon |
| card | `Spacing-L` 24px padding, **flex column, 24px gap**, radius `lumo-border-radius-l` 12px |
| heading → lead | `Spacing-S` 8px |
| label → field | 6px; fields 36px tall, radius 8px |
| primary → tertiary button | 16px (the "Actions" frame) |
| 2FA steps block | 8px between every step; QR 160px with an 8px gap to its link |

**The logo is not the one in `ui/component/or-app/images`.** `theme/ui/public/logo.svg` comes
from Figma (`Login-logo`). In production the logo comes from `manager_config.json`; this is only the stock fallback.

## Environment

- Dark mode: `--blink-settings=preferredColorScheme=0`. **Not** `--force-dark-mode`, which
  applies Blink's auto-darkening and gives a false pass on a theme with no dark styles.

## Vaadin / `@openremote/or-vaadin-components`

- **Form state goes on the component, never on the slotted `<input>`.** Slotting the native
  input is right — `SlotController.initSingle()` reuses it rather than creating its own, and it
  stays in the light DOM — but `InputControlMixin` then *manages* that element. It replaces the
  `id` and **silently drops `name`, `value`, `required` and `autocomplete`**, re-delegating its
  own from the host. Only `type`, `autofocus`, `inputmode` and `dir` survive on the input.

  ```html
  <!-- wrong: renders fine, posts nothing -->
  <or-vaadin-text-field><input slot="input" name="username" required></or-vaadin-text-field>
  <!-- right -->
  <or-vaadin-text-field name="username" required><input slot="input"></or-vaadin-text-field>
  ```

  This shipped: every field on every page came out unnamed, so the login form posted a bare
  `login=` and nothing else. It is invisible in the source, in the rendered page and in a
  screenshot — **the only way to see it is `new FormData(form)` in a real browser.** The
  `<label>` needs no `for`; Vaadin points it at the id it generated and adds `aria-labelledby`.
- Setting `required` on the component makes Lumo render a bullet after the label. The design has
  no required markers, so `login.css` hides `::part(required-indicator)` — semantics kept,
  indicator gone.
- **The rule is per component. Check each one with `new FormData(form)`.** There is no
  consistent contract; every variation below is real and was found only by measuring:

  | component | where `name` goes | why |
  |---|---|---|
  | text / password / email field | **host** | manages the slotted input, drops its attributes |
  | checkbox | **host** | same |
  | **text area** | **the slotted `<textarea>`** | reuses it *without* managing it, so the host is ignored |
  | **select** | **a hidden input you sync** | renders a button + overlay; no form control at all |
  | **radio group** | **a hidden input you sync** | renames every radio it owns, resets values to `"on"` |

- **Two components go further and destroy what you slot in:**
  - **Buttons.** Vaadin's button is `role="button"` with no `type` and no form participation,
    and its Lumo styling is `:host`-scoped inside `@media lumo_components_button` so it cannot
    be applied to a native `<button>`. Emit both, show one via `:defined`, and forward with
    `form.requestSubmit(nativeButton)`.
  - **Radio groups.** `or-vaadin-radio-group` rewrites the `name` of every radio it owns to
    one generated group name, and `vaadin-radio-button` resets `value` to `"on"`. A slotted
    `<input name="selectedCredentialId" value="<id>">` is silently replaced by
    `name="or-vaadin-radio-group-8" value="on"`, so the form posts nothing Keycloak
    understands and 2FA device selection quietly does nothing. Put `value` on the
    `<vaadin-radio-button>`, and mirror the group's value into a hidden input on
    `value-changed` (see `src/pages/otp.ts`).
  - Assume nothing here: check with `new FormData(form)` in a real browser.
- Label color is `--vaadin-input-field-label-color`. An unqualified `#kc-content label` rule
  silently overrides it on every field; scope such rules `label:not([slot])`, because Vaadin's
  own labels are slotted.
- **Inter:** alias `inter-ui/inter.css` (18 faces, 2.1 MB) to `inter-ui/inter-variable-latin.css`
  (~207 KB) and map `--lumo-font-family` onto `InterVariable` — `default.css` asks for `Inter`,
  which will not match.
- The design system bundle appends to `document.body` during module evaluation, so it must be
  loaded deferred. rspack does that by default.

## Keycloakify

- **It generates a template for all ~39 login pages and routes every one into `src/main.ts`.**
  `theme/build.gradle` deletes the ones we do not implement so Keycloak serves them from its
  own theme via the generated `parent=keycloak`. The keep-list is derived from `src/pages`, so
  adding a page file is genuinely the only step.
- **`keycloakify build` deletes its own `build_keycloak/resources` once it has jarred it.** The
  jar is the only durable output, which is why Gradle unpacks it.
- **Maven is required even when its output is discarded** — the CLI checks for `mvn --version`
  before doing anything, and refuses to run with every jar target disabled.
- **`withCustomTranslations` applies to every language, not just the one you list it under.**
  getI18n takes the block for the current language *or the `en` block* — so English house-style
  wording put there leaks into all 30 locales and you get a Dutch page with an English card.
  Only keys Keycloak has no translation for anywhere belong there; English preferences are
  applied conditionally in `src/i18n.ts`.
- **Messages the server resolved outrank custom translations.** The full order is
  `kcContext["x-keycloakify"].messages`, then custom translations, then the bundled set. The
  server contributes any `${key}` it found in a kcContext value — user-profile labels among
  them — so overriding e.g. `email` client-side changes the login page and not the register
  page. Those keys also need `theme/src/main/messages/messages_en.properties`, which the build
  appends to the generated bundle.
- Keycloakify writes Keycloak's whole message bundle into `login/messages/`, which is also what
  makes the inherited pages translated. Append to it; do not replace it.
- `KcContextExtensionPerPage` must be `{}`, not `Record<string, never>` — the latter collapses
  `ExtendKcContext` to `never` and silently turns every field access into a type error.
- `getKcContextMock` is not a plain function: use `createGetKcContextMock({...})` and take
  `getKcContextMock` off the result.
- `keycloakify update-kc-gen` writes `public/keycloakify-dev-resources`, and `keycloakify build`
  hard-fails if that reaches the build output; `rspack.config.mjs` excludes it from the copy.
- The generated page injects `<base href=".../dist/">`, so relative asset URLs work but relative
  *link* and *form* targets would silently retarget. Use the absolute URLs from `kcContext`.

## Keycloak

- **Keycloak sends message *keys* for anything a realm can configure** —
  `totp.supportedApplications`, user-profile labels, admin-authored messages. Resolve them with
  `advancedMsgStr`, never a lookup table.
- Registration is driven by `profile.attributesByName` from Keycloak 24 onwards.
- **`locale` is a user-profile attribute, not a question.** With internationalization on,
  Keycloak adds it to the registration profile so the language the user is reading in follows
  onto the account. Its `displayName` is the bare string `locale` and it has no annotations, so
  rendering the profile naively gives a text field labeled "locale" that posts back empty.
  Keycloak's own `user-profile-commons.ftl` special-cases it into a hidden input; so do we.
- OTP errors come back under field **`totp`**, not `otp`.
- `otpLogin.userOtpCredentials[].userLabel` **may be blank** — rendering it raw gives a radio
  with no accessible label. Keycloak's own `login-otp.ftl` has the same hole.
- `login-config-totp` arrives with a `warning` message saying the user needs to set up an
  authenticator, which the page's own heading and steps already say. It is suppressed.
- **The QR code's quiet zone is not a fixed ratio.** Keycloak scales the code onto a fixed
  246x246 canvas, so the white border is whatever is left after fitting however many modules
  the otpauth URL needs — measured at 20px for one realm and 37px for the same realm renamed.
  Nothing can be hardcoded against it; `src/qr.ts` crops to the ink and CSS re-applies a quiet
  zone we control.
- Set only the realm's **login** theme. `--spi-theme-default=openremote` makes Keycloak look for
  an *admin* theme of that name too, and the admin console then fails to load.

## CSS

- **Space things with flexbox `gap`, not margins.** A container owning one `gap` is easier to
  make responsive, keeps spacing out of the components so they stay reusable, and removes a
  whole class of margin-collapsing surprises. The Figma frames are built this way too — the
  card is a flex column with a single 24px gap — so matching it means fewer values to keep in
  sync. Reach for a margin only where an element genuinely owns its offset from a
  *non*-sibling.
- **Margin collapsing** (for what margins remain): a `margin-top` escapes through
  padding-less wrappers. Use `padding-top`.
- `#kc-content` and `#kc-content-wrapper` are `display: contents` so the card's gap reaches
  the real content rather than a single pass-through div.
- A backtick in a comment *inside* an `html` template ends the template — same trap as `${}`
  there. Write "the name attribute", not the code-quoted form.
- **Do not put load-bearing layout behind `:has()`** — it was silently the difference between
  a 16px and a 33px gap. We render the markup; a modifier class cannot fail that way.
  (Progressive enhancement like `:has(> or-vaadin-button:defined)` is fine.)
- A CSS-mask icon with `contain` is inset by the box's slack. Give the box the icon's own
  aspect ratio and `margin-inline-end` becomes the actual visual gap.
- `overflow-y: auto` clips `position: fixed` children. Move them to a sibling.
- Prefer `em` and derive related values, so a change of font size or image does not need a
  second edit somewhere else.

## Gradle

- `project.hasProperty()` inside `onlyIf` violates the configuration cache. Capture it at
  configuration time.
- The jar is assembled from two resource roots. Anything left under
  `src/main/resources/theme/openremote/login` collides with the generated theme and fails
  `processResources` outright.

## Verifying

The dev server (`cd theme/ui && yarn start`) renders the real pages from Keycloakify's mocks, so
unlike the previous hand-maintained preview harness it cannot drift from what ships — trust it
for layout.

**Do not trust the mocks to be representative, though.** Where the harness "fixed up" mock data
to look like the design, it hid two production bugs at once: a pre-cropped QR concealed that
real codes have a variable quiet zone, and looking right on screen concealed that the radio
group posted nothing. Prefer changing the code so the real data renders correctly over changing
the data so the code looks correct.

It also cannot tell you anything about packaging — whether a page falls through to Keycloak's
theme, whether the message merge worked, whether assets resolve under `url.resourcesPath`.
Confirm those against a real Keycloak with the jar mounted (see `README.md`).
