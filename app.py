"""Cognitive Balance 2.0 — support healthier routines, focus, and balance.

What's new in 2.0
-----------------
* Date-aware schedule with an intensity rating (1-5) per activity
* Load-adjusted burnout model + 0-100 Balance Score (instead of raw hours only)
* Personalised thresholds in the sidebar
* Editable / deletable schedule table, input validation
* 7-day trend chart and category breakdown
* Mood history with trend chart and mood-aware suggestions
* Non-blocking Pomodoro focus timer that auto-logs finished sessions
* Guided 4-7-8 breathing with progress bar and multiple cycles
* Backup / restore (JSON) and CSV export; optional local persistence
"""

import json
import os
import time
from datetime import date, datetime, timedelta
from pathlib import Path

import altair as alt
import pandas as pd
import streamlit as st

# --------------------------------------------------------------------------
# Config & constants
# --------------------------------------------------------------------------
APP_VERSION = "2.0"
st.set_page_config(
    page_title=f"Cognitive Balance {APP_VERSION}",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

CATEGORIES = ["Deep Work", "Physical Recovery", "Mental Rest"]
CATEGORY_COLORS = ["#e4572e", "#29a19c", "#6c8ebf"]
MOODS = ["Exhausted", "Stressed", "Neutral", "Focused", "Energized"]
MOOD_SCORE = {m: i + 1 for i, m in enumerate(MOODS)}
SCHEDULE_COLS = ["Date", "Task", "Category", "Hours", "Intensity"]
DEFAULT_SETTINGS = {"max_load": 6.0, "min_recovery": 2.0, "ratio": 2.0}

# Local persistence is OFF by default: on a hosted app the file would be shared
# between every visitor. Run locally with  CB_PERSIST=1 streamlit run app.py
PERSIST = os.environ.get("CB_PERSIST") == "1"
DATA_FILE = Path(__file__).with_name("cognitive_balance_data.json")


# --------------------------------------------------------------------------
# Data helpers
# --------------------------------------------------------------------------
def clean_schedule(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce any dataframe (editor output, upload, old save) to the schema."""
    df = df.copy()
    for col in SCHEDULE_COLS:
        if col not in df.columns:
            df[col] = None
    df = df[SCHEDULE_COLS]
    dates = pd.to_datetime(df["Date"], errors="coerce").dt.date
    df["Date"] = [d if pd.notna(d) else date.today() for d in dates]
    df["Task"] = df["Task"].fillna("").astype(str).str.strip()
    df["Category"] = df["Category"].where(df["Category"].isin(CATEGORIES), "Deep Work")
    df["Hours"] = pd.to_numeric(df["Hours"], errors="coerce").fillna(0.0).clip(0, 24)
    df["Intensity"] = (
        pd.to_numeric(df["Intensity"], errors="coerce").fillna(3).clip(1, 5).astype(int)
    )
    return df.reset_index(drop=True)


def sample_schedule() -> pd.DataFrame:
    today = date.today()
    return clean_schedule(
        pd.DataFrame(
            [
                {"Date": today, "Task": "Operating Systems Coursework", "Category": "Deep Work", "Hours": 3.0, "Intensity": 4},
                {"Date": today, "Task": "Strength Training (Push Day)", "Category": "Physical Recovery", "Hours": 1.5, "Intensity": 3},
                {"Date": today, "Task": "Reading Fiction (Dark Mode)", "Category": "Mental Rest", "Hours": 1.0, "Intensity": 1},
            ]
        )
    )


def to_payload() -> dict:
    sched = st.session_state.schedule.copy()
    sched["Date"] = sched["Date"].astype(str)
    return {
        "version": APP_VERSION,
        "schedule": sched.to_dict("records"),
        "mood_log": st.session_state.mood_log,
        "settings": st.session_state.settings,
    }


def apply_payload(raw: dict) -> None:
    st.session_state.schedule = clean_schedule(pd.DataFrame(raw.get("schedule", [])))
    st.session_state.mood_log = [
        m for m in raw.get("mood_log", []) if m.get("mood") in MOODS and m.get("time")
    ]
    st.session_state.settings = {**DEFAULT_SETTINGS, **raw.get("settings", {})}


def save_data() -> None:
    if not PERSIST:
        return
    try:
        DATA_FILE.write_text(json.dumps(to_payload(), indent=2, default=str))
    except OSError:
        pass


def init_state() -> None:
    if st.session_state.get("initialized"):
        return
    st.session_state.schedule = sample_schedule()
    st.session_state.mood_log = []
    st.session_state.settings = dict(DEFAULT_SETTINGS)
    if PERSIST and DATA_FILE.exists():
        try:
            apply_payload(json.loads(DATA_FILE.read_text()))
        except (OSError, ValueError):
            pass
    st.session_state.timer = {
        "running": False, "mode": "focus", "end": 0.0, "total": 0,
        "completed": 0, "last_event": "",
    }
    st.session_state.initialized = True


# --------------------------------------------------------------------------
# Burnout model
# --------------------------------------------------------------------------
def day_stats(df: pd.DataFrame, day: date) -> dict:
    d = df[df["Date"] == day]
    work_rows = d[d["Category"] == "Deep Work"]
    work = float(work_rows["Hours"].sum())
    # Load-adjusted hours: intensity 3 is the baseline (1 hr == 1 load hr).
    load = float((work_rows["Hours"] * work_rows["Intensity"] / 3).sum())
    phys = float(d[d["Category"] == "Physical Recovery"]["Hours"].sum())
    mental = float(d[d["Category"] == "Mental Rest"]["Hours"].sum())
    return {"work": work, "load": load, "phys": phys, "mental": mental, "recovery": phys + mental}


def classify(stats: dict, s: dict) -> str:
    if stats["work"] == 0 and stats["recovery"] == 0:
        return "empty"
    if stats["load"] > s["max_load"] and stats["recovery"] < s["min_recovery"]:
        return "critical"
    if stats["load"] > stats["recovery"] * s["ratio"]:
        return "warning"
    return "optimal"


def balance_score(stats: dict, s: dict) -> int:
    score = 100.0
    score -= max(0.0, stats["load"] - s["max_load"]) * 12
    score -= max(0.0, s["min_recovery"] - stats["recovery"]) * 15
    score -= max(0.0, stats["load"] - stats["recovery"] * s["ratio"]) * 5
    return int(max(0, min(100, round(score))))


def recovery_needed(stats: dict, s: dict) -> float:
    return max(0.0, s["min_recovery"] - stats["recovery"], stats["load"] / s["ratio"] - stats["recovery"])


def suggestions(stats: dict, s: dict, mood: str | None) -> list[str]:
    tips = []
    need = recovery_needed(stats, s)
    if need > 0:
        tips.append(f"Add about **{need:.1f} hr** of recovery to get back in range.")
    if stats["load"] >= 3 and stats["mental"] == 0:
        tips.append("No mental rest scheduled — try 30–60 min of reading, music or a walk without a screen.")
    if stats["load"] >= 3 and stats["phys"] == 0:
        tips.append("No physical recovery yet — even a 20-minute walk or stretch helps reset focus.")
    if stats["load"] > s["max_load"]:
        tips.append("Your load is above your daily limit. Consider moving one deep-work block to another day.")
    if mood in ("Exhausted", "Stressed") and stats["load"] >= s["max_load"] * 0.6:
        tips.append(f"You logged **{mood}** and the day is heavy — shorten the next focus block and take a break first.")
    if not tips:
        tips.append("Nothing to fix — keep the rhythm and protect your recovery time.")
    return tips


def latest_mood() -> str | None:
    log = st.session_state.mood_log
    return log[-1]["mood"] if log else None


# --------------------------------------------------------------------------
# Sidebar
# --------------------------------------------------------------------------
def render_sidebar() -> date:
    s = st.session_state.settings
    with st.sidebar:
        st.title("🧠 Cognitive Balance")
        st.caption(f"Version {APP_VERSION}")
        day = st.date_input("Day to view", value=date.today())

        st.subheader("Your limits")
        before = dict(s)
        s["max_load"] = st.number_input("Max load-adjusted work hrs / day", 1.0, 16.0, float(s["max_load"]), 0.5,
                                        help="Deep-work hours weighted by intensity (3/5 = baseline).")
        s["min_recovery"] = st.number_input("Min recovery hrs / day", 0.0, 8.0, float(s["min_recovery"]), 0.5)
        s["ratio"] = st.number_input("Max work : recovery ratio", 1.0, 6.0, float(s["ratio"]), 0.5,
                                     help="Warning triggers when load exceeds recovery × this ratio.")
        if s != before:
            save_data()

        st.subheader("Data")
        st.download_button(
            "⬇️ Backup (JSON)", json.dumps(to_payload(), indent=2, default=str),
            file_name="cognitive_balance_backup.json", mime="application/json", width="stretch",
        )
        csv = clean_schedule(st.session_state.schedule).to_csv(index=False)
        st.download_button("⬇️ Schedule (CSV)", csv, file_name="schedule.csv", mime="text/csv", width="stretch")
        up = st.file_uploader("Restore backup", type="json")
        if up is not None and st.button("Restore from file", width="stretch"):
            try:
                apply_payload(json.load(up))
                save_data()
                st.success("Backup restored.")
                st.rerun()
            except (ValueError, AttributeError):
                st.error("That file isn't a valid Cognitive Balance backup.")
        if st.button("🗑️ Reset everything", width="stretch"):
            for key in ("schedule", "mood_log", "settings", "initialized"):
                st.session_state.pop(key, None)
            if PERSIST and DATA_FILE.exists():
                DATA_FILE.unlink()
            st.rerun()
        if not PERSIST:
            st.caption("Data lives in this browser session. Use Backup to keep it, "
                       "or run locally with `CB_PERSIST=1`.")
    return day


# --------------------------------------------------------------------------
# Tab 1 — Dashboard
# --------------------------------------------------------------------------
def render_dashboard(day: date) -> None:
    s = st.session_state.settings
    df = st.session_state.schedule
    stats = day_stats(df, day)
    status = classify(stats, s)
    score = balance_score(stats, s)

    st.header(f"Overview · {day:%a, %d %b %Y}")
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Work load", f"{stats['load']:.1f} hrs", f"{stats['load'] - s['max_load']:+.1f} vs limit",
              delta_color="inverse", help=f"Raw deep-work time: {stats['work']:.1f} hrs")
    c2.metric("Physical recovery", f"{stats['phys']:.1f} hrs")
    c3.metric("Mental rest", f"{stats['mental']:.1f} hrs")
    c4.metric("Balance score", f"{score if status != 'empty' else '—'}", help="0–100. Penalises overload and too little recovery.")
    if status != "empty":
        st.progress(score / 100)

    st.subheader("System status")
    if status == "empty":
        st.info("Nothing scheduled for this day yet — add activities in the Planner tab.")
    elif status == "critical":
        st.error("⚠️ CRITICAL: High cognitive load with too little recovery. Schedule rest now.")
    elif status == "warning":
        st.warning("⚡ WARNING: Balance is tilting. Add a workout, walk or reading session.")
    else:
        st.success("✅ OPTIMAL: Your routine is balanced and sustainable.")

    if status != "empty":
        with st.expander("What should I do next?", expanded=status in ("critical", "warning")):
            for tip in suggestions(stats, s, latest_mood()):
                st.markdown(f"- {tip}")

    left, right = st.columns(2)
    with left:
        st.subheader("Today's split")
        day_df = df[df["Date"] == day].groupby("Category", as_index=False)["Hours"].sum()
        if day_df.empty or day_df["Hours"].sum() == 0:
            st.caption("No hours logged.")
        else:
            donut = alt.Chart(day_df).mark_arc(innerRadius=60).encode(
                theta="Hours:Q",
                color=alt.Color("Category:N", scale=alt.Scale(domain=CATEGORIES, range=CATEGORY_COLORS)),
                tooltip=["Category", "Hours"],
            )
            st.altair_chart(donut, width="stretch")
    with right:
        st.subheader("Last 7 days")
        start = day - timedelta(days=6)
        week = df[(df["Date"] >= start) & (df["Date"] <= day)].groupby(["Date", "Category"], as_index=False)["Hours"].sum()
        if week.empty:
            st.caption("No data in this window.")
        else:
            week["Date"] = pd.to_datetime(week["Date"])
            bars = alt.Chart(week).mark_bar().encode(
                x=alt.X("Date:T", title=None, axis=alt.Axis(format="%d %b")),
                y=alt.Y("Hours:Q", stack=True),
                color=alt.Color("Category:N", scale=alt.Scale(domain=CATEGORIES, range=CATEGORY_COLORS)),
                tooltip=["Date:T", "Category", "Hours"],
            )
            st.altair_chart(bars, width="stretch")


# --------------------------------------------------------------------------
# Tab 2 — Planner
# --------------------------------------------------------------------------
def render_planner(day: date) -> None:
    st.header("Task Management")
    col_input, col_table = st.columns([1, 2])

    with col_input:
        st.markdown("#### Add new activity")
        with st.form("add_activity", clear_on_submit=True):
            name = st.text_input("Activity name")
            category = st.selectbox("Category", CATEGORIES)
            when = st.date_input("Date", value=day)
            hours = st.slider("Duration (hours)", 0.5, 8.0, 1.0, 0.5)
            intensity = st.slider("Intensity (1 = light, 5 = draining)", 1, 5, 3)
            submitted = st.form_submit_button("Add to schedule", width="stretch")
        if submitted:
            if not name.strip():
                st.error("Give the activity a name.")
            else:
                new = pd.DataFrame([{"Date": when, "Task": name.strip(), "Category": category,
                                     "Hours": hours, "Intensity": intensity}])
                st.session_state.schedule = clean_schedule(pd.concat([st.session_state.schedule, new], ignore_index=True))
                save_data()
                st.success(f"Added '{name.strip()}'")
                st.rerun()

    with col_table:
        st.markdown("#### Schedule (edit cells, or select rows and press Delete)")
        edited = st.data_editor(
            st.session_state.schedule,
            key="schedule_editor",
            num_rows="dynamic",
            width="stretch",
            hide_index=True,
            column_config={
                "Date": st.column_config.DateColumn("Date", required=True),
                "Task": st.column_config.TextColumn("Task", required=True),
                "Category": st.column_config.SelectboxColumn("Category", options=CATEGORIES, required=True),
                "Hours": st.column_config.NumberColumn("Hours", min_value=0.0, max_value=24.0, step=0.5, format="%.1f"),
                "Intensity": st.column_config.NumberColumn("Intensity", min_value=1, max_value=5, step=1),
            },
        )
        cleaned = clean_schedule(edited)
        if not cleaned.equals(st.session_state.schedule):
            st.session_state.schedule = cleaned
            save_data()
            st.rerun()


# --------------------------------------------------------------------------
# Tab 3 — Wellness hub
# --------------------------------------------------------------------------
def run_breathing(cycles: int) -> None:
    phases = [("Breathe IN", 4, "info"), ("HOLD", 7, "warning"), ("Exhale OUT", 8, "success")]
    box, bar = st.empty(), st.progress(0.0)
    for c in range(cycles):
        for label, secs, kind in phases:
            steps = secs * 10
            for i in range(steps):
                if i % 10 == 0:
                    getattr(box, kind)(f"Cycle {c + 1}/{cycles} · {label} · {secs - i // 10}s")
                bar.progress((i + 1) / steps)
                time.sleep(0.1)
    box.success("✅ Reset complete. You are ready to focus.")
    bar.empty()


def _log_focus_session(minutes: int) -> None:
    row = pd.DataFrame([{"Date": date.today(), "Task": "Focus session (Pomodoro)", "Category": "Deep Work",
                         "Hours": round(minutes / 60, 2), "Intensity": 4}])
    st.session_state.schedule = clean_schedule(pd.concat([st.session_state.schedule, row], ignore_index=True))
    save_data()


def _timer_body() -> None:
    t = st.session_state.timer
    preset = st.session_state.get("timer_preset", "25 / 5")
    if t["last_event"]:
        st.info(t["last_event"])

    if t["running"]:
        remaining = int(t["end"] - time.time())
        if remaining <= 0:
            focus_min, break_min = (int(x) for x in preset.split("/"))
            if t["mode"] == "focus":
                t["completed"] += 1
                _log_focus_session(focus_min)
                t.update(mode="break", end=time.time() + break_min * 60, total=break_min * 60,
                         last_event=f"🎉 Focus block done and logged to your schedule. Break: {break_min} min.")
            else:
                t.update(running=False, mode="focus", last_event="☕ Break over. Start another focus block when ready.")
            st.rerun()
        label = "🎯 Focus" if t["mode"] == "focus" else "☕ Break"
        st.markdown(f"### {label} — {remaining // 60:02d}:{remaining % 60:02d}")
        st.progress(max(0.0, min(1.0, 1 - remaining / max(t["total"], 1))))
        if st.button("Stop timer"):
            t.update(running=False, mode="focus", last_event="")
            st.rerun()
    else:
        st.selectbox("Focus / break (minutes)", ["25 / 5", "50 / 10", "90 / 20"], key="timer_preset")
        if st.button("▶️ Start focus block", type="primary"):
            focus_min = int(st.session_state.timer_preset.split("/")[0])
            t.update(running=True, mode="focus", end=time.time() + focus_min * 60,
                     total=focus_min * 60, last_event="")
            st.rerun()
    st.caption(f"Focus blocks completed this session: {t['completed']}")


def render_timer() -> None:
    running = st.session_state.timer["running"]
    st.fragment(run_every=1 if running else None)(_timer_body)()


def render_wellness(day: date) -> None:
    s = st.session_state.settings
    st.header("Mental Wellness & Grounding")

    st.subheader("1. State of mind check-in")
    st.write("Self-awareness is the first step in preventing burnout.")
    default_mood = latest_mood() or "Neutral"
    mood = st.select_slider("How are you feeling right now?", options=MOODS, value=default_mood)
    note = st.text_input("Optional note", placeholder="What's driving this?")
    if st.button("Log mood"):
        st.session_state.mood_log.append({"time": datetime.now().isoformat(timespec="seconds"), "mood": mood, "note": note.strip()})
        save_data()
        stats = day_stats(st.session_state.schedule, day)
        st.success(f"Mood logged: {mood}.")
        for tip in suggestions(stats, s, mood)[:2]:
            st.markdown(f"- {tip}")

    log = st.session_state.mood_log
    if log:
        mdf = pd.DataFrame(log)
        mdf["time"] = pd.to_datetime(mdf["time"])
        mdf["score"] = mdf["mood"].map(MOOD_SCORE)
        line = alt.Chart(mdf).mark_line(point=True).encode(
            x=alt.X("time:T", title=None),
            y=alt.Y("score:Q", title="Mood (1 = exhausted, 5 = energized)", scale=alt.Scale(domain=[1, 5])),
            tooltip=["time:T", "mood", "note"],
        )
        st.altair_chart(line, width="stretch")
        with st.expander("Mood history"):
            st.dataframe(mdf[["time", "mood", "note"]].sort_values("time", ascending=False),
                         width="stretch", hide_index=True)

    st.divider()
    st.subheader("2. Focus timer")
    st.write("Work in timed blocks. Finished focus blocks are logged to today's schedule automatically.")
    render_timer()

    st.divider()
    st.subheader("3. Tactical reset — 4-7-8 breathing")
    cycles = st.slider("Cycles (≈19 s each)", 1, 4, 1)
    if st.button("Start breathing exercise"):
        run_breathing(cycles)

    st.divider()
    st.subheader("4. Suggested disconnect routines")
    st.info("💡 **Digital detox:** Switch off monitors 1 hour before bed. Reading fiction with enlarged serif fonts in low light reduces eye strain after heavy coding sessions.")
    st.info("💡 **Physical reset:** Regular strength training and walks help regulate stress and sleep.")
    st.info("💡 **Micro-breaks:** Look at something 20 feet away for 20 seconds every 20 minutes.")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
init_state()
day = render_sidebar()

st.title("Cognitive Balance")
st.markdown("### Support healthier routines, focus, and balance.")

tab1, tab2, tab3 = st.tabs(["📊 Dashboard & Burnout Predictor", "📅 Schedule Planner", "🧘 Mental Wellness Hub"])
with tab1:
    render_dashboard(day)
with tab2:
    render_planner(day)
with tab3:
    render_wellness(day)
