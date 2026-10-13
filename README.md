# NeuroDial results dashboard

Live results of [Med-EEG / NeuroDial](https://github.com/ManasDasri/Med-EEG): can EEG read
meditation? Every score is leave-one-person-out, compared with shuffled-label chance and with
non-EEG baselines, plus the pre-registered replication on an independent dataset.

## How it stays current

The page has no data of its own. On every visit, and every 5 minutes while it's open, it
fetches `results/latest/results.json` from the Med-EEG repository's `main` branch. Publish a
new analysis run there and the dashboard shows it, with no rebuild:

```bash
# in Med-EEG
python src/publish_results.py --models_run <run dir> --replication_run <run dir> \
    --qc ds001787=<preprocessing_qc.csv> --qc ds008836=<preprocessing_qc.csv>
git add results/latest/results.json && git commit -m "Publish results" && git push
```

The header shows when the bundle was published and which analysis commit produced it.

## Files

- `index.html`, `style.css`, `app.js`: the whole site. Plain HTML/CSS/JS, no build step, no
  external libraries.
- Local preview: `python -m http.server`, then open
  `http://localhost:8000/?data=<path or URL to a results.json>`.
