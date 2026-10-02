/* Local-only interaction checks. No browser mutation reaches the server. */
/* eslint-disable @typescript-eslint/no-require-imports -- This is a standalone CommonJS Node harness. */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require(process.env.PORTAL_UI_PLAYWRIGHT_PATH || 'playwright')
const base = new URL(process.env.PORTAL_UI_BASE_URL || 'http://localhost:3000')
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)) throw Error('UI checks require a local app origin')
const output = process.env.PORTAL_UI_OUTPUT || '/private/tmp/taru-portal-ui-checks'

async function main() {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const results = []
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', storageState: process.env.PORTAL_UI_STORAGE_STATE || undefined })
    await context.route('**/*', async route => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue()
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'UI verification: server writes are blocked' }) })
    })
    const page = await context.newPage()
    async function go(route) {
      const hydrated = route === '/login' ? Promise.resolve(true) : page.waitForResponse(response => response.url().includes('/api/notifications'), { timeout: 10000 }).then(() => true, () => false)
      await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' })
      await page.locator('h1').first().waitFor({ timeout: 10000 })
      await hydrated
      if (route === '/tasks') await page.getByText('Loading tasks…', { exact: true }).waitFor({ state: 'hidden' })
    }
    async function check(name, action) {
      await action()
      results.push(name)
      console.log('PASS', name)
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await go('/tasks')
    await check('Task editing survives cancelled dismissal and failed saving', async () => {
      await page.getByRole('button', { name: 'New task', exact: true }).first().click()
      const title = page.getByLabel('Task', { exact: true })
      await title.fill('UI verification task — sample only')
      page.once('dialog', dialog => dialog.dismiss())
      await page.keyboard.press('Escape')
      assert(await page.getByRole('dialog').isVisible())
      assert.equal(await title.inputValue(), 'UI verification task — sample only')
      await page.getByRole('dialog').getByRole('button', { name: 'Create task', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'server writes are blocked' }).waitFor()
      assert.equal(await title.inputValue(), 'UI verification task — sample only')
      page.once('dialog', dialog => dialog.accept())
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    })
    await check('Back and Forward keep URL, view and dirty values together', async () => {
      await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
      await page.waitForURL('**/dashboard')
      await page.getByRole('link', { name: 'Tasks', exact: true }).click()
      await page.waitForURL('**/tasks')
      await page.getByRole('button', { name: 'New task', exact: true }).first().click()
      await page.getByLabel('Task', { exact: true }).fill('Keep this draft')
      page.once('dialog', dialog => dialog.dismiss())
      await page.evaluate(() => history.back())
      await page.waitForURL('**/tasks')
      assert.equal(await page.getByLabel('Task', { exact: true }).inputValue(), 'Keep this draft')
      page.once('dialog', dialog => dialog.accept())
      await page.evaluate(() => history.back())
      await page.waitForURL('**/dashboard')
      assert.match(await page.locator('h1').first().innerText(), /overview|dashboard/i)
      await page.evaluate(() => history.forward())
      await page.waitForURL('**/tasks')
      await page.getByRole('button', { name: 'New task', exact: true }).first().waitFor()
    })
    await go('/tasks/projects')
    await check('Explicit Cancel retains an edited project when dismissal is cancelled', async () => {
      await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
      await page.locator('#project-name').fill('Sample project draft')
      page.once('dialog', dialog => dialog.dismiss())
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.equal(await page.locator('#project-name').inputValue(), 'Sample project draft')
      page.once('dialog', dialog => dialog.accept())
      await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    })
    for (const width of process.env.PORTAL_UI_INTERACTIONS_ONLY === '1' ? [] : [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      for (const route of ['/tasks', '/dashboard', '/fleet', '/admin/users', '/daily-records', '/assets', '/rostering', '/login']) {
        await go(route)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        await page.screenshot({ path: path.join(output, `${route.slice(1).replaceAll('/', '-')}-${width}.png`), fullPage: true })
        if (overflow > 1) console.log('OVERFLOW', await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => el.outerHTML.slice(0, 240))))
        assert(overflow <= 1, `${route} overflows ${overflow}px at ${width}px`)
      }
      console.log('PASS responsive surfaces', width)
    }
    if (process.env.PORTAL_UI_ROUTE_AUDIT === '1') {
      const routes = (await fs.readdir('src/app/(portal)', { recursive: true }))
        .filter(file => file.endsWith('/page.tsx') && !file.includes('['))
        .map(file => '/' + file.slice(0, -'/page.tsx'.length)).sort()
      const audit = []
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 1000 })
        for (const route of routes) {
          console.log('AUDIT', route, width)
          try {
            await go(route)
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
            const titles = await page.locator('main h1').count()
            audit.push({ route, width, destination: new URL(page.url()).pathname, overflow, titles })
            if (overflow > 1 || titles !== 1) console.log('AUDIT REVIEW', route, width, { overflow, titles })
          } catch (error) { audit.push({ route, width, error: error.message }); console.log('AUDIT UNVERIFIED', route, width) }
        }
      }
      await fs.writeFile(path.join(output, 'route-audit.json'), JSON.stringify(audit, null, 2))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await go('/tasks')
    await check('Mobile navigation is a themed, keyboard dismissible drawer', async () => {
      const trigger = page.getByRole('button', { name: /Toggle menu/ })
      await trigger.click()
      const drawer = page.locator('[data-slot="sidebar"][data-mobile="true"]')
      await drawer.waitFor()
      assert.equal(await drawer.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(36, 77, 62)')
      await page.keyboard.press('Escape')
      await drawer.waitFor({ state: 'hidden' })
    })
    await go('/fleet')
    await check('Ride request uses readable labels and error correction links', async () => {
      await page.getByRole('button', { name: 'New request', exact: true }).first().click()
      await page.getByRole('button', { name: 'Submit ride request', exact: true }).click()
      const errors = page.getByRole('alert')
      await errors.first().waitFor()
      const linkedErrors = errors.locator('a[href^="#"]')
      if (await linkedErrors.count()) {
        const first = linkedErrors.first()
        const target = await first.getAttribute('href')
        await first.click()
        assert.equal(await page.evaluate(() => document.activeElement?.id), target.slice(1))
      }
      await page.screenshot({ path: path.join(output, 'ride-validation-mobile.png'), fullPage: true })
      await page.getByRole('combobox', { name: 'Property', exact: true }).click()
      await page.getByRole('option').first().click()
      await page.getByRole('combobox', { name: 'Task reason', exact: true }).click()
      await page.getByRole('option', { name: 'Create a new task', exact: true }).click()
      await page.locator('#request-start').fill('2026-10-10')
      await page.locator('#request-end').fill('2026-10-09')
      await page.getByRole('button', { name: 'Submit ride request', exact: true }).click()
      const titleError = page.locator('a[href="#fleet-task-title"]')
      await titleError.waitFor()
      await titleError.click()
      assert.equal(await page.evaluate(() => document.activeElement.id), 'fleet-task-title')
      assert(await page.locator('#request-end').getAttribute('aria-invalid') === 'true')
      await page.locator('#fleet-task-title').fill('Sample trip task')
      await page.locator('#request-end').fill('2026-10-10')
      await page.getByRole('button', { name: 'Submit ride request', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'server writes are blocked' }).waitFor()
      assert.equal(await page.locator('#fleet-task-title').inputValue(), 'Sample trip task')
      await page.getByRole('tab', { name: 'Other trip', exact: true }).click()
      await page.locator('#request-destination').fill('Sample destination')
      await page.getByRole('combobox', { name: 'Task property', exact: true }).click()
      await page.getByRole('option').first().click()
      await page.getByRole('combobox', { name: 'Pick-up', exact: true }).click()
      await page.getByRole('option', { name: 'Other…', exact: true }).click()
      await page.locator('#request-origin-text').fill('Sample pick-up')
      await page.getByRole('button', { name: 'Submit ride request', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'server writes are blocked' }).waitFor()
      assert.equal(await page.locator('#request-origin-text').inputValue(), 'Sample pick-up')
      await page.waitForFunction(() => !document.querySelector('#request-origin-text')?.disabled)
      const dismissed = page.waitForEvent('dialog')
      page.once('dialog', dialog => dialog.dismiss())
      await page.keyboard.press('Escape')
      await dismissed
      assert(await page.getByRole('dialog').isVisible())
      const accepted = page.waitForEvent('dialog')
      page.once('dialog', dialog => dialog.accept())
      await page.keyboard.press('Escape')
      await accepted
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    })
    await go('/admin/users')
    await check('Mobile administrator can edit a user and retains changes after failure', async () => {
      await page.getByRole('button', { name: 'Edit user', exact: true }).first().click()
      await page.getByLabel('Full Name', { exact: true }).fill('Sample administrator draft')
      await page.getByRole('dialog').getByRole('button', { name: 'Save Changes', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'server writes are blocked' }).waitFor()
      assert.equal(await page.getByLabel('Full Name', { exact: true }).inputValue(), 'Sample administrator draft')
      page.once('dialog', dialog => dialog.accept())
      await page.keyboard.press('Escape')
    })
    await go('/rostering/setup')
    await check('Roster workspace tabs preserve dirty forecast values and ask once', async () => {
      await page.getByRole('tab', { name: 'Occupancy forecast', exact: true }).click()
      const field = page.getByRole('spinbutton', { name: /Occupancy percent for/ }).first()
      await field.fill('72')
      let confirmations = 0
      const cancel = dialog => { confirmations++; return dialog.dismiss() }
      page.on('dialog', cancel)
      await page.getByRole('tab', { name: 'CSV imports', exact: true }).click()
      page.off('dialog', cancel)
      assert.equal(confirmations, 1)
      assert.equal(await page.getByRole('tab', { name: 'Occupancy forecast', exact: true }).getAttribute('aria-selected'), 'true')
      assert.equal(await field.inputValue(), '72')
      await page.getByRole('button', { name: 'Fill month', exact: true }).click()
      let finish
      const gate = new Promise(resolve => { finish = resolve })
      const matcher = '**/api/rostering/forecasts'
      await context.route(matcher, async route => {
        if (route.request().method() === 'GET') return route.fallback()
        await gate
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Sample delayed save failure' }) })
      })
      await page.getByRole('button', { name: 'Save month', exact: true }).click()
      assert(await field.isDisabled())
      await page.getByRole('tab', { name: 'CSV imports', exact: true }).click()
      assert.equal(await page.getByRole('tab', { name: 'Occupancy forecast', exact: true }).getAttribute('aria-selected'), 'true')
      finish()
      await page.getByRole('alert').filter({ hasText: 'Sample delayed save failure' }).waitFor()
      assert.equal(await field.inputValue(), '65')
      await context.unroute(matcher)
      page.once('dialog', dialog => dialog.accept())
      await page.getByRole('tab', { name: 'CSV imports', exact: true }).click()
    })
    await go('/tasks')
    await check('Saving an attachment does not discard an unsaved task comment', async () => {
      const response = await context.request.get(new URL('/api/tasks/options', base).href)
      const { actor } = await response.json()
      const id = '00000000-0000-4000-a000-000000000099'
      const task = { id, org_id: actor.orgId, title: 'Sample task for attachment checks', description: null,
        property_id: null, property_name: null, project_id: null, project_name: null,
        committee_id: actor.operationsCommitteeId, committee_name: 'Operations', status: 'todo',
        priority: 'medium', approval: 'not_required', approval_cycle: 0, version: 1,
        due_date: null, created_at: '2026-10-01T00:00:00Z', completed_at: null, archived_at: null,
        assignee_ids: [], assignees: [], paused_status: null }
      const matcher = `**/api/tasks/${id}**`
      await context.route(matcher, route => {
        const url = new URL(route.request().url())
        const value = url.pathname.endsWith('/history') ? { events: [], comments: [], files: [] } : task
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) })
      })
      await page.goto(new URL(`/tasks?task=${id}`, base).href, { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: 'discussion', exact: true }).click()
      const comment = page.getByRole('textbox', { name: 'New comment', exact: true })
      await comment.fill('Unsaved sample comment')
      const uploaded = page.waitForResponse(r => r.url().endsWith('/attachments') && r.request().method() === 'POST')
      await page.locator('input[type="file"]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=', 'base64') })
      await uploaded
      await page.getByRole('button', { name: 'Add comment', exact: true }).waitFor()
      await page.waitForFunction(() => !document.querySelector('textarea[name="body"]')?.closest('fieldset')?.disabled)
      let asked = false
      page.once('dialog', dialog => { asked = true; return dialog.dismiss() })
      await page.keyboard.press('Escape')
      assert(asked, 'Attachment success cleared the unrelated draft registration')
      assert.equal(await comment.inputValue(), 'Unsaved sample comment')
      page.once('dialog', dialog => dialog.accept())
      await page.keyboard.press('Escape')
      await context.unroute(matcher)
    })
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
    await go('/tasks')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    assert.equal(await page.locator('[data-slot="sidebar-wrapper"]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(20, 40, 31)')
    await page.screenshot({ path: path.join(output, 'tasks-dark-reduced-motion.png'), fullPage: true })
    await context.setOffline(true)
    await page.getByRole('status').filter({ hasText: /offline/i }).waitFor()
    await context.setOffline(false)
    await page.getByRole('status').filter({ hasText: /offline/i }).waitFor({ state: 'hidden' })
    await page.emulateMedia({ media: 'print' })
    assert.equal(await page.locator('[data-portal-header]').evaluate(el => getComputedStyle(el).display), 'none')
    await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference', colorScheme: 'light' })
    for (const route of ['/u/ui-sample', '/m/ui-sample', '/e/ui-sample']) {
      await page.goto(new URL(route, base).href, { waitUntil: 'domcontentloaded' })
      assert.equal(await page.locator('.portal-theme').count(), 0, `${route} has portal theme leakage`)
    }
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ base: base.origin, results, responsiveWidths: [320, 390, 768, 1024, 1440] }, null, 2))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
