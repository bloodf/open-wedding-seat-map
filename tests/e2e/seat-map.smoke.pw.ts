import { expect, test, type Page } from '@playwright/test'

const testIds = {
  editor: 'seat-map-editor',
  toolbar: 'editor-toolbar',
  newMap: 'new-map-button',
  canvas: 'seat-map-canvas',
  guestCsvInput: 'guest-csv-input',
  sceneJsonInput: 'scene-json-input',
  guestList: 'guest-list',
  currentMapName: 'current-map-name',
  exportJson: 'export-json-button',
  exportSvg: 'export-svg-button',
  exportPdf: 'export-pdf-button',
} as const

const fixtures = {
  guestsCsv: 'tests/fixtures/guests.csv',
  sampleScene: 'tests/fixtures/sample-scene.json',
} as const

async function openEditor(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId(testIds.editor)).toBeVisible()
  await expect(page.getByRole('main', { name: /wedding seat map editor/i })).toBeVisible()
}

async function createNewMap(page: Page) {
  await openEditor(page)
  await page.getByTestId(testIds.newMap).click()
  await expect(page.getByTestId(testIds.canvas)).toBeVisible()
}

async function expectDownload(page: Page, action: () => Promise<void>, filePattern: RegExp) {
  const [download] = await Promise.all([page.waitForEvent('download'), action()])

  expect(download.suggestedFilename()).toMatch(filePattern)
}

test.describe('Wedding Seat Map editor smoke', () => {
  test('creates an editable seating map', async ({ page }) => {
    await createNewMap(page)

    await expect(page.getByTestId(testIds.toolbar)).toBeVisible()
    await expect(page.locator('[data-testid^="seat-map-object-table-"]').first()).toBeVisible()
  })

  test('imports guests from CSV and exports JSON and SVG', async ({ page }) => {
    await createNewMap(page)

    await page.getByTestId(testIds.guestCsvInput).setInputFiles(fixtures.guestsCsv)

    await expect(page.getByTestId(testIds.guestList)).toContainText('Ana Silva')
    await expect(page.getByTestId(testIds.guestList)).toContainText('Ravi Patel')

    await expectDownload(page, () => page.getByTestId(testIds.exportJson).click(), /\.json$/)
    await expectDownload(page, () => page.getByTestId(testIds.exportSvg).click(), /\.svg$/)
  })

  test('imports a JSON scene fixture', async ({ page }) => {
    await openEditor(page)

    await page.getByTestId(testIds.sceneJsonInput).setInputFiles(fixtures.sampleScene)

    await expect(page.getByTestId(testIds.canvas)).toBeVisible()
    await expect(page.getByTestId(testIds.currentMapName)).toHaveText('Fixture Reception')
    await expect(page.getByText('Head Table')).toBeVisible()
  })

  test('exports a PDF handoff file', async ({ page }) => {
    await createNewMap(page)

    await expectDownload(page, () => page.getByTestId(testIds.exportPdf).click(), /\.pdf$/)
  })

  test('keeps the editor usable on a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await createNewMap(page)

    await expect(page.getByTestId(testIds.toolbar)).toBeVisible()
    await expect(page.getByTestId(testIds.exportPdf)).toBeVisible()
  })

  test('exposes basic accessible landmarks and named controls', async ({ page }) => {
    await createNewMap(page)

    await expect(page.getByRole('main', { name: /wedding seat map editor/i })).toBeVisible()
    await expect(page.getByRole('toolbar', { name: /editor tools/i })).toBeVisible()

    const unnamedControls = await page.locator('button, a, input, select, textarea').evaluateAll((elements) =>
      elements.filter((element) => {
        const explicitName = element.getAttribute('aria-label') ?? element.getAttribute('title') ?? ''
        const visibleText = element.textContent ?? ''
        const id = element.getAttribute('id')
        const hasLabel = id ? Boolean(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : false

        return !explicitName.trim() && !visibleText.trim() && !hasLabel
      }).length,
    )

    expect(unnamedControls).toBe(0)
  })
})
