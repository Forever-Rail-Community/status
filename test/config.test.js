import { test } from 'node:test';
import assert from 'node:assert/strict';
import shippedConfig from '../status.config.js';
import { ConfigError, monitorComponents, resolveConfig, slugify } from '../lib/config.js';
import { baseConfig } from './helpers.js';

test('the shipped status.config.js is valid', () => {
  assert.doesNotThrow(() => resolveConfig(shippedConfig));
});

test('fills defaults and assigns component ids', () => {
  const config = resolveConfig(baseConfig());
  assert.equal(config.theme, 'dark');
  assert.equal(config.historyDays, 30);
  assert.equal(config.header.showTitle, true);
  assert.equal(config.header.logo, null);
  assert.equal(config.footer.poweredBy, true);
  assert.equal(config.notice, null);
  assert.equal(config.groups[0].description, null);
  assert.deepEqual(config.groups[0].components.map((c) => c.id), ['site', 'support']);
  assert.equal(config.accent, null);
  assert.deepEqual(monitorComponents(config).map((c) => c.monitor), ['m1']);
});

test('header options: hidden title, logo, links, button', () => {
  const config = resolveConfig({
    ...baseConfig(),
    header: {
      showTitle: false,
      logo: { src: '/logo.svg', alt: 'Logo' },
      links: [{ label: 'Site', href: 'https://example.com' }],
      button: { label: 'Discord', href: 'https://discord.gg/x' },
    },
  });
  assert.equal(config.header.showTitle, false);
  assert.deepEqual(config.header.logo, { src: '/logo.svg', alt: 'Logo', height: 28, href: null });
  assert.equal(config.header.links.length, 1);
  assert.equal(config.header.button.label, 'Discord');
});

const rejects = (overrides, pattern) =>
  assert.throws(() => resolveConfig({ ...baseConfig(), ...overrides }), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, pattern);
    return true;
  });

test('rejects invalid configs with the field path', () => {
  rejects({ theme: 'neon' }, /theme/);
  rejects({ historyDays: 90 }, /historyDays/);
  rejects({ groups: [] }, /groups/);
  rejects({ groups: [{ name: 'G', components: [{ status: 'operational' }] }] }, /groups\[0\]\.components\[0\]\.name/);
  rejects({ groups: [{ name: 'G', components: [{ name: 'X', status: 'on fire' }] }] }, /status/);
  rejects({ groups: [{ name: 'G', components: [{ name: 'X', monitor: 'a', status: 'operational' }] }] }, /not both/);
  rejects({ header: { links: [{ label: 'Bad', href: 'javascript:alert(1)' }] } }, /header\.links\[0\]\.href/);
  rejects({ header: { logo: { alt: 'no src' } } }, /header\.logo\.src/);
  rejects({ accent: 'orange' }, /accent/);
  rejects({ groups: [{ name: 'G', components: [{ monitor: 'm1' }] }] }, /components\[0\]\.id/);
  rejects({ groups: [{ name: 'G', components: [{ name: 'X', id: 'Bad Id' }] }] }, /id/);
  rejects(
    { groups: [{ name: 'G', components: [{ name: 'Same' }, { name: 'same' }] }] },
    /duplicate id "same"/,
  );
});

test('explicit ids win over the name slug', () => {
  const config = resolveConfig(baseConfig([{ name: 'G', components: [{ id: 'run8-se', name: 'SE Route' }] }]));
  assert.equal(config.groups[0].components[0].id, 'run8-se');
  assert.equal(slugify('Run8 – SE Route!'), 'run8-se-route');
});
