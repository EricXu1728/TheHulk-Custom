module.exports = { importFragmentAnchorsCb };

/**
 * Import scriptless anchors encoded in the page URL fragment before the site's
 * scripts run. This lets a scan test a site's named-property gadgets even when
 * the site itself does not parse HTML from its fragment.
 */
async function importFragmentAnchorsCb(visitor, page) {
  await page.addInitScript(() => {
    if (!window.location.hash || !document.documentElement) return;
    if (document.documentElement.hasAttribute("data-hulk-fragment-imported")) return;

    let markup;
    try {
      markup = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }
    if (!markup.includes("<a")) return;

    const parsed = new DOMParser().parseFromString(markup, "text/html");
    const anchors = parsed.body.querySelectorAll("a");
    if (!anchors.length) return;

    document.documentElement.setAttribute("data-hulk-fragment-imported", "");
    for (const input of anchors) {
      const anchor = document.createElement("a");
      for (const attribute of ["id", "name", "href", "rel"]) {
        if (input.hasAttribute(attribute)) {
          anchor.setAttribute(attribute, input.getAttribute(attribute));
        }
      }
      anchor.hidden = true;
      document.documentElement.appendChild(anchor);
    }

    // The fragment is the supplied test payload. Clear it after import so a
    // site's own hash importer does not append duplicate elements.
    history.replaceState(history.state, "", `${location.pathname}${location.search}`);
  });
}
