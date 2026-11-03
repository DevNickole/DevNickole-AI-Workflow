import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function templatesDir(): string {
  return fileURLToPath(new URL('../../templates/', import.meta.url));
}

export function readTemplate(name: string): string {
  return readFileSync(new URL(`../../templates/${name}`, import.meta.url), 'utf8');
}

export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Template placeholder {{${key}}} has no value`);
    return vars[key];
  });
}
