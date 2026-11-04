# Changelog

## 0.5.1

- Fixed a crash when output is piped to something that stops reading early, like `head`. dnw now finishes the work and exits normally.

## 0.5.0

- Skills: keep one copy and dnw writes it to Claude Code, Codex and Antigravity. `dnw skill new`, `edit`, `sync`, `list` and `remove` manage project skills in `.dnw/skills/`.
- `dnw skill add` downloads a skill from `owner/repo`, a git URL or a local folder, after showing what it contains. `dnw skill adopt` brings in a skill you already have.
- Shared skills ship with dnw and install through `dnw init` and `dnw upgrade`: `dnw-spec-writing` and `dnw-skill-writing`.
- Editing a shared skill makes a project copy that upgrades leave alone. Copies edited by hand are kept, with `SKILL.md.new` beside them.
- `dnw status` warns when a skill needs `dnw skill sync`. Claude Code: `/dnw-skill-new` and `/dnw-skill-add`.

## 0.4.0

- `dnw init` shows what it found in the project (stack, tests, docs, AI tools, existing workflow) and asks to use it in one keypress, or to go through each setting.
- Detects existing workflows (custom AI commands, `docs/tasks/`, `docs/plans/`, spec-kit `specs/`, ...) and asks to keep them alongside dnw or convert open tasks into dnw specs.
- `dnw onboard`: a project-specific checklist for your AI to read the code, write the docs and ask you about gaps; `--done` finishes it. `dnw status` reminds until then. Claude Code: `/dnw-onboard`.

## 0.3.0

- Fillable templates for architecture, products and design-system docs. `dnw init` writes them for new doc locations.
- `dnw docs add [kind]` adds templates for missing docs in existing projects; never overwrites.
- `dnw status` lists docs that are still unfilled templates; AI instructions ask the agent to fill them with you before drafting specs.
- Claude Code: `/dnw-docs-add`.

## 0.2.0

- Laravel support: detected from `artisan` or `laravel/framework` (before the Vite `package.json`); tests run with `php artisan test` (Pest or PHPUnit).
- Plain PHP support: `php vendor/bin/pest` or `php vendor/bin/phpunit`.
- Design system detection includes `resources/js/components/`, `resources/js/Components/` and `resources/views/components/`.

## 0.1.1

- Global installs use the release tarball URL; `npm i -g github:...` leaves a broken link on npm 11.
- Install hints name the exact release to install.

## 0.1.0

- Initial release: init, spec, task, status, upgrade.
