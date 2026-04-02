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

    // Create locale for the project
    await request(app.getHttpServer())
      .post(`/translations/projects/${TEST_PROJECT_SLUG}/locales`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: TEST_LOCALE, isDefault: true })
      .expect(201);

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
      .get(`/translations/${TEST_PROJECT_SLUG}/${TEST_NAMESPACE}/${TEST_LOCALE}`)
      .expect(200);

    expect(res.body).toHaveProperty('greeting', 'Hello');
  });
});
