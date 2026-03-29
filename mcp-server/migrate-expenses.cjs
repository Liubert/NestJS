#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:8080';
const TOKEN = 'lmcp_vwp99U7Mt5hah5i_ERH5ii8rYUlGqOBZXTEdO3Xo480';
const PROJECT_SLUG = 'travis';
const NAMESPACE = 'expenses';

const DICT_DIR = '/Users/liubomyrfedyshyn/WebstormProjects/untitled/admin/app/features/expenses/i18n/dictionaries';

function readJson(filename) {
  return JSON.parse(fs.readFileSync(`${DICT_DIR}/${filename}`, 'utf-8'));
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function importKey(key, values) {
  // Try PATCH first
  const patchRes = await request(
    'PATCH',
    `/translations/projects/${PROJECT_SLUG}/sandbox/namespaces/${NAMESPACE}/entries/${encodeURIComponent(key)}`,
    { values }
  );
  if (patchRes.status === 200 || patchRes.status === 201) {
    return 'updated';
  }
  if (patchRes.status === 404) {
    // Fall back to POST
    const postRes = await request(
      'POST',
      `/translations/projects/${PROJECT_SLUG}/sandbox/namespaces/${NAMESPACE}/entries`,
      { key, values }
    );
    if (postRes.status === 200 || postRes.status === 201) {
      return 'created';
    }
    throw new Error(`POST failed with ${postRes.status}: ${postRes.body}`);
  }
  throw new Error(`PATCH failed with ${patchRes.status}: ${patchRes.body}`);
}

async function main() {
  console.log('Reading translation files...');
  const en = readJson('en.json');
  const no = readJson('no.json');
  const da = readJson('da.json');
  const sv = readJson('sv.json');

  const keys = Object.keys(en);
  console.log(`Found ${keys.length} keys in en.json`);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const values = {};
    if (en[key] !== undefined) values['en'] = en[key];
    if (no[key] !== undefined) values['nb-NO'] = no[key];
    if (da[key] !== undefined) values['da-DK'] = da[key];
    if (sv[key] !== undefined) values['sv'] = sv[key];

    try {
      const result = await importKey(key, values);
      if (result === 'created') created++;
      else updated++;
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${keys.length} — created: ${created}, updated: ${updated}, failed: ${failed}`);
      }
    } catch (err) {
      failed++;
      errors.push({ key, error: err.message });
      console.error(`FAILED [${key}]: ${err.message}`);
    }
  }

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(`Total keys processed: ${keys.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed:  ${failed}`);
  if (errors.length > 0) {
    console.log('\nFailed keys:');
    errors.forEach(e => console.log(`  - ${e.key}: ${e.error}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
