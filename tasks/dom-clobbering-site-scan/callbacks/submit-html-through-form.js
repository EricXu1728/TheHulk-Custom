module.exports = { submitHTMLThroughFormCb };

/** Fill a site's selected rich-text field and submit it with the generated test markup. */
async function submitHTMLThroughFormCb(visitor, page) {
  const fieldSelector = process.env.HULK_FORM_FIELD_SELECTOR;
  const submitSelector = process.env.HULK_FORM_SUBMIT_SELECTOR;
  if (!fieldSelector && !submitSelector) return;
  if (!fieldSelector || !submitSelector) {
    throw new Error("Set both HULK_FORM_FIELD_SELECTOR and HULK_FORM_SUBMIT_SELECTOR.");
  }

  const markup = process.env.HULK_INJECT_MARKUP || "";
  await page.locator(fieldSelector).fill(markup);
  await page.locator(submitSelector).click();
  const settleMs = Number(process.env.HULK_FORM_SETTLE_MS || 200);
  if (settleMs > 0) await page.waitForTimeout(settleMs);
}
