import { expect, test } from '@playwright/test';
import type { UploadedFile } from './helpers';
import { MOCK_ENDPOINTS, NEW_CHAT_PATH, selectMockEndpoint, uniqueName } from './helpers';

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`textbook planning at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('uploads, selects, and sends a textbook with lesson details', async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.route('**/api/config', async (route) => {
        const response = await route.fetch();
        const config = await response.json();
        await route.fulfill({
          response,
          json: { ...config, interface: { ...config.interface, textbooks: true } },
        });
      });
      await page.goto(NEW_CHAT_PATH);
      await selectMockEndpoint(page, MOCK_ENDPOINTS[1]);
      const draft = page.getByRole('textbox', { name: 'Message input' });
      await draft.fill('Include an activity using a microscope diagram.');

      if (viewport.width < 1024) {
        await page.getByRole('button', { name: 'Textbooks', exact: true }).click();
      }
      const panel = page.locator('#textbooks-panel');
      await expect(panel).toBeVisible();
      const filename = `${uniqueName('Grade-9-Biology')}.md`;
      const upload = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/files' &&
          response.request().method() === 'POST',
      );
      await panel.locator('input[type="file"]').setInputFiles({
        name: filename,
        mimeType: 'text/markdown',
        buffer: Buffer.from(
          '# Grade 9 Biology\n\n## Unit 2: Cell biology\n\n### The microscope and its uses\nA microscope magnifies objects. The objective and eyepiece lenses magnify a specimen. Students identify the stage, objective lens, eyepiece and focusing knobs.\n',
        ),
      });
      const response = await upload;
      expect(response.ok(), await response.text()).toBeTruthy();
      const uploaded = (await response.json()) as UploadedFile;
      const book = panel.getByRole('button', { name: new RegExp(filename.replace(/\./g, '\\.')) });
      await expect(book).toHaveAttribute('aria-pressed', 'true');
      await expect(book).toBeEnabled();

      await book.click();
      await expect(book).toHaveAttribute('aria-pressed', 'false');
      await book.click();
      await expect(book).toHaveAttribute('aria-pressed', 'true');
      await panel.getByLabel('Topic, unit, or section').fill('Unit 2: The microscope and its uses');
      await panel.getByLabel('Grade and section').fill('Grade 9, A');
      await panel.getByLabel('Duration (minutes)').fill('40');
      await panel.getByLabel('Lesson date (optional)').fill('2026-11-02');

      await page.screenshot({ path: testInfo.outputPath('textbooks.png'), fullPage: true });
      const requestPromise = page.waitForRequest(
        (request) =>
          request.method() === 'POST' && /\/api\/agents\/chat(?:\/|$)/.test(request.url()),
      );
      await panel.getByRole('button', { name: 'Create daily lesson plan' }).click();
      const request = await requestPromise;
      const payload = request.postDataJSON();
      expect(payload.text).toContain('Unit 2: The microscope and its uses');
      expect(payload.text).toContain('Grade 9, A');
      expect(payload.text).toContain('Duration: 40 minutes');
      expect(payload.text).toContain('2026-11-02');
      expect(payload.text).toContain('Include an activity using a microscope diagram.');
      expect(payload.files).toEqual(
        expect.arrayContaining([expect.objectContaining({ file_id: uploaded.file_id })]),
      );
      if (viewport.width < 1024) {
        await expect(panel).not.toBeVisible();
      }
      await expect(page.getByTestId('stop-button')).toHaveCount(0, { timeout: 30_000 });
      await expect(draft).toHaveValue('');
      await page.reload();
      if (viewport.width < 1024) {
        await page.getByRole('button', { name: 'Textbooks', exact: true }).click();
      }
      await expect(
        page
          .locator('#textbooks-panel')
          .getByRole('button', { name: new RegExp(filename.replace(/\./g, '\\.')) }),
      ).toBeVisible();
    });
  });
}
