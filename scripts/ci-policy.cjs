function ciPolicy(value = process.env.CI_DUPLICATE_ENABLED) {
  if (value !== undefined && !['true', 'false', ''].includes(value)) {
    throw new Error('CI_DUPLICATE_ENABLED must be true or false');
  }
  const includeDuplicate = value === 'true';
  return {
    includeDuplicate,
    grep: includeDuplicate ? '@ci|@registered-data' : '@ci',
    families: { '@login': 3, '@existing-dashboard': 1, '@nexus': 7, '@consistency': 1,
      '@duplicate-cluster': includeDuplicate ? 1 : 0, '@fresh-data': 0 },
    expectedCount: includeDuplicate ? 12 : 11,
  };
}
module.exports = { ciPolicy };
