import puppeteer from "puppeteer";

async function main(): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto("https://example.com", {
      waitUntil: "domcontentloaded",
    });

    const title = await page.title();
    const h1Text = await page.locator("h1").map((element) => element.textContent);

    console.log("Page title:", title);
    console.log("H1:", h1Text);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error("Puppeteer script failed:", error);
  process.exitCode = 1;
});
