# 🧠 Cognitive Balance 2.0

A Streamlit app that helps you balance deep work with physical recovery and mental rest, and warns you before you burn out.

## What's new in 2.0
| Area | 1.0 | 2.0 |
|---|---|---|
| Burnout model | Raw hours, fixed thresholds | Intensity-weighted load, 0–100 Balance Score, your own limits |
| Schedule | Add-only list | Dated entries, editable/deletable table, validation |
| Dashboard | 3 metrics + status | + donut split, 7-day trend, "what should I do next?" advice |
| Mood | Single value | Mood history, trend chart, mood-aware suggestions |
| Focus | – | Pomodoro timer (25/5, 50/10, 90/20) that auto-logs sessions |
| Breathing | One 4-7-8 round | 1–4 cycles with live progress |
| Data | Lost on refresh | JSON backup/restore, CSV export, optional local persistence |

## Run locally
```bash
pip install -r requirements.txt
streamlit run app.py
# keep data between restarts:
CB_PERSIST=1 streamlit run app.py
```

## How the score works
* **Load** = Σ (deep-work hours × intensity / 3). Intensity 3 is the baseline.
* **Critical**: load > your max *and* recovery < your minimum.
* **Warning**: load > recovery × your ratio.
* **Balance Score** starts at 100 and loses points for overload, too little recovery, and a skewed work:recovery ratio.

Persistence is off by default so a hosted deployment never shares one visitor's data with another.
