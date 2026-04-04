import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test('homepage loads with sign-in form', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await expect(page).toHaveTitle(/AIEzzy/, { timeout: 10_000 });
  });

  test('signup page loads', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('body')).toBeVisible();
    // Should have password input
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('forgot password page loads', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Protected Routes Redirect', () => {
  const protectedRoutes = ['/my-trips', '/plan', '/route', '/deep-plan', '/settings'];

  for (const route of protectedRoutes) {
    test(`${route} redirects to sign-in`, async ({ page }) => {
      await page.goto(route);
      // Middleware redirects to / with callbackUrl
      await page.waitForURL(/\/\?callbackUrl=/, { timeout: 10_000 });
      expect(page.url()).toContain('callbackUrl=');
    });
  }
});

test.describe('API Auth Guards', () => {
  test('GET /api/trips returns 401', async ({ request }) => {
    const res = await request.get('/api/trips');
    expect(res.status()).toBe(401);
  });

  test('POST /api/ai/suggest returns 401', async ({ request }) => {
    const res = await request.post('/api/ai/suggest', {
      data: { prompt: 'test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/ai/itinerary-activities returns 401', async ({ request }) => {
    const res = await request.post('/api/ai/itinerary-activities', {
      data: { city: 'Paris' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/profile returns 401', async ({ request }) => {
    const res = await request.get('/api/profile');
    expect(res.status()).toBe(401);
  });

  test('GET /api/flights returns 401', async ({ request }) => {
    const res = await request.get('/api/flights?from=x&to=y&date=2026-01-01&adults=1');
    expect(res.status()).toBe(401);
  });
});

test.describe('NextAuth Infrastructure', () => {
  test('providers endpoint returns google + credentials', async ({ request }) => {
    const res = await request.get('/api/auth/providers');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('google');
    expect(data).toHaveProperty('credentials');
  });

  test('session endpoint returns empty for unauthenticated', async ({ request }) => {
    const res = await request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).not.toHaveProperty('user');
  });

  test('csrf endpoint returns token', async ({ request }) => {
    const res = await request.get('/api/auth/csrf');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('csrfToken');
    expect(data.csrfToken.length).toBeGreaterThan(10);
  });
});
