/* Read-only geometry checks, shared by browser QA and the local UI harness. */
import assert from 'node:assert/strict'

export function measureReportLayout() {
  const main = document.querySelector('[data-portal-main]')
  const report = document.querySelector('[data-visit-report]') || main.firstElementChild
  const card = report.querySelector('[data-slot="card"]')
  const actions = report.querySelector('[data-report-actions]') || report.querySelector('.fixed')
  const status = actions?.querySelector('[role="status"]')
  const buttons = [...actions?.querySelectorAll('button') || []]
  const history = report.querySelector(':scope > details')
  const controls = [...report.querySelectorAll('input:not([type="checkbox"]):not([type="file"]), select, textarea')]
    .filter(el => el.getBoundingClientRect().width > 0)
    .map(el => {
      const rect = el.getBoundingClientRect()
      const parent = el.closest('label') || el.parentElement
      const bounds = parent.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        name: el.getAttribute('aria-label') || parent.textContent.trim().slice(0, 80),
        contained: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
        height: rect.height,
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        contentHeight: rect.height - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) - Number.parseFloat(style.borderTopWidth) - Number.parseFloat(style.borderBottomWidth),
        type: el.getAttribute('type'),
        padding: Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight),
      }
    })
  return {
    width: innerWidth,
    overflow: document.documentElement.scrollWidth - innerWidth,
    cardLeft: card.getBoundingClientRect().left,
    availableLeft: main.getBoundingClientRect().left + Number.parseFloat(getComputedStyle(main).paddingLeft),
    controls,
    iosWebkit: CSS.supports('-webkit-touch-callout', 'none'),
    actions: actions ? {
      availableWidth: actions.getBoundingClientRect().width - Number.parseFloat(getComputedStyle(actions).paddingLeft) - Number.parseFloat(getComputedStyle(actions).paddingRight),
      statusBottom: status.getBoundingClientRect().bottom,
      height: actions.getBoundingClientRect().height,
      buttons: buttons.map(el => {
        const rect = el.getBoundingClientRect()
        return { top: rect.top, width: rect.width, left: rect.left, right: rect.right }
      }),
      clearance: report.getBoundingClientRect().bottom - history.getBoundingClientRect().bottom,
    } : null,
  }
}

export function assertReportLayout(layout) {
  assert(layout.overflow <= 1, `Report overflows by ${layout.overflow}px`)
  if (layout.width < 640) {
    assert(layout.cardLeft <= layout.availableLeft + 1, 'Nested page padding wastes phone form width')
  }
  for (const control of layout.controls) {
    assert(control.contained, `${control.name} extends beyond its field container`)
    assert(control.height >= 44, `${control.name} is too short to tap`)
    assert(control.fontSize >= 16, `${control.name} can trigger input zoom`)
    assert(!Number.isFinite(control.lineHeight) || control.contentHeight >= control.lineHeight - 1, `${control.name} clips enlarged text vertically`)
    if (layout.iosWebkit && ['date', 'time', 'datetime-local', 'month', 'week'].includes(control.type)) {
      assert.equal(control.padding, 0, `${control.name} reintroduces WebKit's padded temporal-input sizing bug`)
    }
  }
  if (layout.actions) {
    assert(layout.actions.clearance >= layout.actions.height + 16, 'Fixed actions can cover the end of the report')
    if (layout.width < 640) {
      assert(layout.actions.statusBottom <= layout.actions.buttons[0].top, 'Save status crowds phone buttons')
      for (const button of layout.actions.buttons) {
        assert(button.width >= (layout.actions.availableWidth - 24) / 2, 'Phone action button is cramped')
        assert(button.left >= 0 && button.right <= layout.width, 'Action button exceeds the viewport')
      }
    }
  }
}
