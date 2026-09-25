import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("signed-in users can reach the explicit website checker", async () => {
  const [app, shell, view] = await Promise.all([
    readFile(new URL("../app/SignalamApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/AppShell.jsx", import.meta.url), "utf8"),
    readFile(new URL("../app/views/WebsiteCheckView.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /"website-check"/);
  assert.match(app, /<WebsiteCheckPage\s*\/>/);
  assert.match(shell, /AI Website Check/);
  assert.match(view, /confirmed: true/);
  assert.match(view, /api\("\/website-check"/);
  assert.match(view, /not a guarantee that a website is legitimate/);
  assert.match(view, /not saved to my activity history/);
});
