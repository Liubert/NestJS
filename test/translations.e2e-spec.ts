import request from 'supertest';
import {
  setupTestApp,
  teardownTestApp,
  getAuthToken,
  createTestAdminUser,
} from './test-setup';
import type { INestApplication } from '@nestjs/common';

describe('Translations CRUD (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const TEST_PROJECT_SLUG = 'test-integ-project';
  const TEST_NAMESPACE = 'common';
  const TEST_LOCALE = 'en';

  beforeAll(async () => {
    app = await setupTestApp();
    await createTestAdminUser();
    token = await getAuthToken('testadmin@test.com', 'TestAdmin123!');

    // Create project (no defaultLocale — CreateProjectDto only accepts slug and optional name)
    await request(app.getHttpServer())
      .post('/translations/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Integration Project',
        slug: TEST_PROJECT_SLUG,
      })
      .expect(201);

    // Locale 'en' is auto-created as default by createProject.
    // Create it only if it doesn't exist (expect 201 or 409).
    await request(app.getHttpServer())
      .post(`/translations/projects/${TEST_PROJECT_SLUG}/locales`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: TEST_LOCALE, isDefault: true })
      .expect((res) => {
        if (res.status !== 201 && res.status !== 409) {
          throw new Error(`Expected 201 or 409, got ${res.status}`);
        }
      });

    // Create namespace for the project (CreateNamespaceDto uses 'slug' field)
    await request(app.getHttpServer())
      .post(`/translations/projects/${TEST_PROJECT_SLUG}/namespaces`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: TEST_NAMESPACE })
      .expect(201);
  }, 120000); // Testcontainer startup can take up to 60s

  afterAll(async () => {
    await teardownTestApp();
  });

  it('should auto-initialize sandbox on project creation', async () => {
    const res = await request(app.getHttpServer())
      .get(`/translations/projects/${TEST_PROJECT_SLUG}/sandbox/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.initialized).toBe(true);
    expect(res.body.initializedAt).toBeTruthy();
    expect(res.body.hasChanges).toBe(false);
  });

  it('should allow creating sandbox entry without manual init', async () => {
    const res = await request(app.getHttpServer())
      .post(
        `/translations/projects/${TEST_PROJECT_SLUG}/sandbox/namespaces/${TEST_NAMESPACE}/entries`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: 'sandbox.auto.test',
        values: { [TEST_LOCALE]: 'Sandbox works' },
      })
      .expect(201);

    expect(res.body.key).toBe('sandbox.auto.test');
    expect(res.body.values[TEST_LOCALE]).toBe('Sandbox works');
  });

  it('should list sandbox entries without manual init', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/translations/projects/${TEST_PROJECT_SLUG}/sandbox/namespaces/${TEST_NAMESPACE}/entries`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('should return sandbox diff without manual init', async () => {
    const res = await request(app.getHttpServer())
      .get(`/translations/projects/${TEST_PROJECT_SLUG}/sandbox/diff`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('entries');
  });

  it('should create a translation entry and retrieve it', async () => {
    // Create entry
    const createRes = await request(app.getHttpServer())
      .post(
        `/translations/projects/${TEST_PROJECT_SLUG}/namespaces/${TEST_NAMESPACE}/entries`,
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        key: 'greeting',
        values: { [TEST_LOCALE]: 'Hello' },
      })
      .expect(201);

    expect(createRes.body).toBeDefined();

    // Retrieve entries via paginated list endpoint
    const getRes = await request(app.getHttpServer())
      .get(
        `/translations/projects/${TEST_PROJECT_SLUG}/namespaces/${TEST_NAMESPACE}/entries`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // Response is PaginatedResponse<EntryRow>: { data: EntryRow[], meta: {...} }
    expect(getRes.body).toHaveProperty('data');
    expect(Array.isArray(getRes.body.data)).toBe(true);

    const entries = getRes.body.data;
    const greeting = entries.find((e: any) => e.key === 'greeting');
    expect(greeting).toBeDefined();

    // EntryRow.values is Record<string, string>: { en: 'Hello', ... }
    expect(greeting.values).toBeDefined();
    expect(greeting.values[TEST_LOCALE]).toBe('Hello');
  });

  it('should serve translations via public endpoint without auth', async () => {
    // Public endpoint: GET /translations/:projectSlug/:namespace/:locale
    // Returns flat Record<string, string>: { greeting: 'Hello', ... }
    const res = await request(app.getHttpServer())
      .get(
        `/translations/${TEST_PROJECT_SLUG}/${TEST_NAMESPACE}/${TEST_LOCALE}`,
      )
      .expect(200);

    expect(res.body).toHaveProperty('greeting', 'Hello');
  });
});
