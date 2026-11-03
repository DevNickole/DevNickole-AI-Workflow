import semver from 'semver';
/** Ordered list of all migrations. Add one whenever a release changes the spec format. */
export const migrations = [];
export function pendingMigrations(from, to, list = migrations) {
    return list
        .filter((m) => semver.gt(m.version, from) && semver.lte(m.version, to))
        .sort((a, b) => semver.compare(a.version, b.version));
}
/** The "## x.y.z" sections of a changelog with from < x.y.z <= to. */
export function changelogBetween(changelog, from, to) {
    return changelog
        .split(/^(?=## )/m)
        .filter((section) => {
        const v = /^## (\S+)/.exec(section)?.[1];
        return v !== undefined && semver.valid(v) !== null && semver.gt(v, from) && semver.lte(v, to);
    })
        .join('')
        .trim();
}
