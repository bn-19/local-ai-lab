# Halloween candy demo

Use the local app at http://127.0.0.1:4173/app/. Pair with the Mac, then open the prepared candy task from **Saved tasks**. This opens a saved real dataset and its trained model results, not fictional sample data. The Candy report section opens by default and includes shortcut buttons.

## A short demo sequence

1. Open the prepared candy task from **Saved tasks**: show the 85-row FiveThirtyEight dataset and initial matchup-win dashboard.
2. Click **Which chocolate candies are most popular?** The local candy adapter selects a ranking plan; the button sets the visible Chocolate filter, and trusted DuckDB calculations produce the chart.
3. Click **Compare chocolate and non-chocolate average popularity.** Explain that this compares observed matchup preferences, not causal effects of chocolate.
4. Click **Rank the cheapest fruity candies.** Point out the axis is relative price percentile, not a dollar price.
5. Click **How many grams of sugar are in each candy?** The model requests clarification instead of treating sugarpercent as grams.
6. Expand **Improve model** to show the actual recorded 29/34 → 34/34 held-out plan comparison, the saved adapter and training evidence. Do not retrain during the presentation unless desired; the adapter is already saved.

The dataset has 85 competitor entries, including comparison items such as coins. These are historical matchup scores, not current sales, objective taste scores or nutrition advice. Charts and exact tables are calculated from the imported CSV. The generic dashboard's filter is separate from the candy question's all/chocolate/fruity selection, which is shown with every report.

## Dataset and provenance

Original: [FiveThirtyEight candy-power-ranking](https://github.com/fivethirtyeight/data/tree/master/candy-power-ranking), CC BY 4.0. Credit: FiveThirtyEight, *The Ultimate Halloween Candy Power Ranking*. Binary flags use 0/1; winpercent is matchup win percentage, and sugarpercent/pricepercent are within-dataset percentiles. No raw candy values were changed.

CSV SHA-256: `46c17cdb8c0212bc3e0cee2a9617a75d1ce642cd1559c332b1d9a2c4ed19b8cb`. GitHub's commit lookup was rate-limited, so provenance pins the downloaded content hash rather than claiming a commit revision. Original file and attribution are in ignored `.local-lab/sources/candy/`.

The supplied rdrr documentation agrees with the original dataset definitions. Baselight now redirects to a shutdown announcement; the supplied BIMM143 page was inaccessible through the web tool. Neither is required at demo runtime. The user explicitly chose analytics only, so no Roboflow vision model or candy-photo recognition is claimed.

## Model and verification

A separate candy QLoRA adapter is trained from the same pinned Qwen3 4B MLX base as the retail pilot. The retail adapter is preserved and never used for candy questions. Profile matching is tested before selection. The output is restricted to operation, measure, subset and order enums; trusted templates execute all calculations. Percentile definitions and unsupported units are explicit training policy.

102 synthetic instruction examples, 17 validation examples and 34 held-out checks were split by base question wording before subset variants were generated. The final checks test instruction interpretation, not prediction of hidden candy ratings. Prompts and runtime are identical before/after weight training. A single fixed 120-step candidate improved 29/34 → 34/34 in 185.5 seconds on this Mac. This small synthetic benchmark does not establish general analytics competence.

Training run: `c278c4a0-9729-44e3-ad60-02fe6a4b0c96`. Task: `ccb0975d-50d6-461b-937f-a875bd1598a3`. Dataset: `750611eb-df83-4796-8f6a-8845da57bb4a`.

Local evidence: `.local-lab/candy-training.json`, `.local-lab/candy-demo.json`, `.local-lab/candy-acceptance.json`, `.local-lab/candy-oracle.json`. Original-row Decimal calculations independently validate rankings, averages and counts for the live integration checks.

## Reproduce

With the existing actor, backend and model services running and MLX dependencies installed:

```sh
.venv/bin/python scripts/download-candy.py
node scripts/candy-demo.mjs
.venv/bin/python scripts/candy-oracle.py
node scripts/candy-acceptance.mjs
```

The setup script imports the CSV, creates the saved task and runs a new bounded training comparison; it does not reuse a previous training result. All model work reserves the existing Device queue. No browser automation or cloud inference is used. Source download requires internet; inference and training use local model files.

## Live rehearsal results and important limitation

The first live free-text question, “Which chocolate candies are most popular?”, exposed a generalization failure: the adapter selected all entries despite passing the synthetic held-out set. No further training or test-set tuning was done to hide this result. The app now has an explicit **Confirm the candy selection** dropdown (All/Chocolate/Fruity). Preset buttons visibly set this selector, and the confirmed value controls trusted filtering. The original `modelPlan` and final `plan` are both retained; a correction is shown when they differ. The generic dashboard filter does not control the candy report.

With explicit confirmed subsets, all nine live integration checks passed against the separate original-CSV Decimal oracle. This is not nine independent model-only successes: it validates the combined model + confirmed-filter + trusted-calculation workflow. The 34/34 synthetic plan score should not be presented as robust free-text filter understanding.

Verified examples:

- Reese's Peanut Butter cup: 84.18029% matchup wins, leading the ranking.
- Chocolate mean: 60.9215294054054%; non-chocolate mean: 42.142257%.
- Fruity entries: 38.
- Lowest fruity price-percentile entries include Dum Dums and Fruit Chews (0.034000002).
- Grams-of-sugar and exact-dollar-price questions both request clarification.

All-entry low-sugar rankings include “One dime” and “One quarter”, which are original comparison entries in the source. Do not present these as edible candies or remove them silently. Use the Chocolate/Fruity selections for a candy-only presentation slice.
