---
"@frontlit/page-builder": minor
---

Pricing and Header block fixes, and block icons (#137).

- Pricing: the grid now has one column per plan (up to 4) on desktop, so 1–2 plans fill the row; a single plan is capped at `max-w-xl`.
- Pricing: optional Monthly/Yearly switch (`pricingSwitcher`, `monthlyPriceCaption`, `yearlyPriceCaption`, `defaultPeriod`) with per-tier `priceYearly` and `buttonActionYearly`, each falling back to the monthly value. Both prices are server-rendered; a small client island flips between them.
- Header: the mobile menu button is hidden when the header has no links or CTA.
- Header: optional GitHub link (`githubRepo` as `owner/repo` or a github.com URL) with an optional star count (`showGithubStars`), fetched in the browser.
- Every built-in block has its own icon (`metadata.icon`) in the "Add a block" picker and the block settings header, instead of one shared layout icon.
