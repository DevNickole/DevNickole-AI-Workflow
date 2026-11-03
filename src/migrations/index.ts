import semver from 'semver';

export interface MigrationChange {
  /** path relative to the project root */
  file: string;
  before: string;
  after: string;
}

export interface Migration {
  /** the dnw version that introduced this migration */
  version: string;
  description: string;
  plan(root: string): MigrationChange[];
}

/** Ordered list of all migrations. Add one whenever a release changes the spec format. */
export const migrations: Migration[] = [];

export function pendingMigrations(from: string, to: string, list: Migration[] = migrations): Migration[] {
  return list
    .filter((m) => semver.gt(m.version, from) && semver.lte(m.version, to))
    .sort((a, b) => semver.compare(a.version, b.version));
}

/** The "## x.y.z" sections of a changelog with from < x.y.z <= to. */
export function changelogBetween(changelog: string, from: string, to: string): string {
  return changelog
    .split(/^(?=## )/m)
    .filter((section) => {
      const v = /^## (\S+)/.exec(section)?.[1];
      return v !== undefined && semver.valid(v) !== null && semver.gt(v, from) && semver.lte(v, to);
    })
    .join('')
    .trim();
}
