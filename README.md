# 🧠 Cognitive Balance 2.0

Track deep work vs. physical recovery vs. mental rest, and get warned before you burn out.
Static site (HTML/CSS/JS, no build step, no backend) — deploys on Vercel as-is.

## Deploy on Vercel
1. Replace the old Streamlit files in the repo with these files (delete `app.py`, `requirements.txt`, and the old `streamlit/` folder if it only holds Streamlit config).
2. Push to GitHub.
3. In Vercel: **Add New → Project → import the repo**. Framework preset: **Other**. Leave build command and output directory empty. Deploy.

Run locally: `npx serve .` (or open `index.html`).

## 📚 Exam Season mode (BRANDIT 3.0 twist: "Exam season begins")
- Add exams with date, study hours needed and difficulty; countdown cards and a dashboard banner appear.
- **Burnout-safe study plan generator**: spreads study hours evenly across the days left, never exceeding your daily load limit, and auto-adds walk and screen-off recovery blocks so the Balance Score stays healthy.
- Exam mode shifts limits (+2 hrs load, +0.5 hr recovery, +0.5 ratio) and adds sleep-protection advice in the final 3 days.
- If the target can't fit before the exam, the app tells you instead of silently overloading you.

## Features
- Intensity-weighted burnout model, 0–100 Balance Score, adjustable limits
- Dated schedule with inline editing and delete
- Dashboard: status, advice, today's split, 7-day trend
- Mood log with trend chart and mood-aware suggestions
- Pomodoro timer (25/5, 50/10, 90/20) that logs finished focus blocks
- Guided 4-7-8 breathing with animation
- Data stays in your browser (localStorage); JSON backup/restore and CSV export

## How the score works
- **Load** = Σ (deep-work hours × intensity ÷ 3). Intensity 3 is the baseline.
- **Critical**: load > your max *and* recovery < your minimum.
- **Warning**: load > recovery × your ratio.
- **Score** starts at 100 and loses points for overload, too little recovery and a skewed work:recovery ratio.

Not medical advice.
