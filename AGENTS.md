- 你正在协助的对象是 **Zixuan**。
- 假设 Zixuan 是一名经验丰富的资深前端工程师，熟悉 CRDTs、富文本编辑器，实时协作计数，熟悉 Rust、JS、TS 等主流语言及其生态。
- 对于前端 Zixuan 的技术偏好是 React, Tanstack, Tailwind, Vite, Vitest, Tsdown, Oxlint, Oxfmt。
- 你说的话需要少用黑话，少用行话，尽量用简单词来描述，但要追求语言准确。

## Premark Native Editor Invariants

When working on the native Markdown editor, reread `plans/2026-04-20_premark-native-editor-redesign.md` first if context was compacted or if you are changing editor architecture.

Core invariants:

- Markdown source offsets are authoritative. DOM selection, textarea value, rendered text, and Canvas paint positions are never the source of truth.
- Every caret, selection rect, hit-test result, active Markdown control, composition preedit, and Canvas text paint position must map back to source offsets.
- Grapheme boundaries are the smallest editable text boundary. Never place a caret or deletion range inside a grapheme cluster.
- Text measurement, editable geometry, and Canvas painting must share the same boundary model. Do not add a Canvas-only width heuristic.
- Source-mode editing preserves every `\n` as a visual line advance.
- Source-mode parsing preserves line-leading spaces as editable text and does not treat 4-space indentation as an implicit code block; fenced code remains the explicit code-block syntax.
- When the caret or selection touches a table block or image source line, only that table/image range renders as plain Markdown source text; other tables/images keep normal rendering.
- Hidden textarea state is only an OS input bridge. It must not overwrite native composition state while IME is active.
- Active Markdown controls and composition are render views over the same source, not separate documents.
- Remote/AI patches must go through explicit source patch APIs and must not enter local undo history.

Architecture decisions:

- Keep CodeMirror overlay out of the product path.
- Keep browser input hosting reusable; do not duplicate hidden textarea, IME, clipboard, pointer, or keyboard logic across DOM and Canvas stories.
- Keep `PremarkEditorController` as the product-facing API; layout/editable internals may change behind render snapshots.
- Font readiness is correctness-sensitive. If a change can affect `measureText`, layout and editable geometry must be invalidated or rebuilt.

Testing ladder:

- Prefer pure tests for parser/layout/editable geometry, grapheme boundaries, Markdown behavior, remote patch rebasing, and performance invariants.
- Use Playwright Chromium for Storybook wiring, browser event smoke, screenshots, and visual parity.
- Use Playwright WebKit as a fast WebKit proxy only; it is not proof of real Safari or real IME behavior.
- Use Safari WebDriver for isolated Safari behavior; do not use it as proof of foreground OS input.
- Use `tests/real-interactions` for foreground keyboard, clipboard, double/triple click, and HID drag behavior that Playwright cannot prove.
- Use `tests/macos-ime` for real macOS IME. It must gate on unlocked session, foreground browser, input source readiness, and HID reachability before sending global input.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Vite+ Workflow

`vp` is a global binary that handles the full development lifecycle. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

### Start

- create - Create a new project from a template
- migrate - Migrate an existing project to Vite+
- config - Configure hooks and agent integration
- staged - Run linters on staged files
- install (`i`) - Install dependencies
- env - Manage Node.js versions

### Develop

- dev - Run the development server
- check - Run format, lint, and TypeScript type checks
- lint - Lint code
- fmt - Format code
- test - Run tests

### Execute

- run - Run monorepo tasks
- exec - Execute a command from local `node_modules/.bin`
- dlx - Execute a package binary without installing it as a dependency
- cache - Manage the task cache

### Build

- build - Build for production
- pack - Build libraries
- preview - Preview production build

### Manage Dependencies

Vite+ automatically detects and wraps the underlying package manager such as pnpm, npm, or Yarn through the `packageManager` field in `package.json` or package manager-specific lockfiles.

- add - Add packages to dependencies
- remove (`rm`, `un`, `uninstall`) - Remove packages from dependencies
- update (`up`) - Update packages to latest versions
- dedupe - Deduplicate dependencies
- outdated - Check for outdated packages
- list (`ls`) - List installed packages
- why (`explain`) - Show why a package is installed
- info (`view`, `show`) - View package information from the registry
- link (`ln`) / unlink - Manage local package links
- pm - Forward a command to the package manager

### Maintain

- upgrade - Update `vp` itself to the latest version

These commands map to their corresponding tools. For example, `vp dev --port 3000` runs Vite's dev server and works the same as Vite. `vp test` runs JavaScript tests through the bundled Vitest. The version of all tools can be checked using `vp --version`. This is useful when researching documentation, features, and bugs.

## Common Pitfalls

- **Using the package manager directly:** Do not use pnpm, npm, or Yarn directly. Vite+ can handle all package manager operations.
- **Always use Vite commands to run tools:** Don't attempt to run `vp vitest` or `vp oxlint`. They do not exist. Use `vp test` and `vp lint` instead.
- **Running scripts:** Vite+ built-in commands (`vp dev`, `vp build`, `vp test`, etc.) always run the Vite+ built-in tool, not any `package.json` script of the same name. To run a custom script that shares a name with a built-in command, use `vp run <script>`. For example, if you have a custom `dev` script that runs multiple services concurrently, run it with `vp run dev`, not `vp dev` (which always starts Vite's dev server).
- **Do not install Vitest, Oxlint, Oxfmt, or tsdown directly:** Vite+ wraps these tools. They must not be installed directly. You cannot upgrade these tools by installing their latest versions. Always use Vite+ commands.
- **Use Vite+ wrappers for one-off binaries:** Use `vp dlx` instead of package-manager-specific `dlx`/`npx` commands.
- **Import JavaScript modules from `vite-plus`:** Instead of importing from `vite` or `vitest`, all modules should be imported from the project's `vite-plus` dependency. For example, `import { defineConfig } from 'vite-plus';` or `import { expect, test, vi } from 'vite-plus/test';`. You must not install `vitest` to import test utilities.
- **Type-Aware Linting:** There is no need to install `oxlint-tsgolint`, `vp lint --type-aware` works out of the box.

## CI Integration

For GitHub Actions, consider using [`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) to replace separate `actions/setup-node`, package-manager setup, cache, and install steps with a single action.

```yaml
- uses: voidzero-dev/setup-vp@v1
  with:
    cache: true
- run: vp check
- run: vp test
```

## Review Checklist for Agents

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to validate changes.
<!--VITE PLUS END-->
