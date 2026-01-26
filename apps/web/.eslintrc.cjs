module.exports = {
  extends: ['../../.eslintrc.cjs', 'next/core-web-vitals'],
  env: {
    browser: true,
    node: true,
  },
  settings: {
    next: {
      // Monorepo: `eslint` is sometimes executed from the repo root (e.g. via lint-staged).
      rootDir: [__dirname],
    },
  },
};
