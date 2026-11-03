# Changelog

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
