import streamlit as st
import pandas as pd
import time

# 1. Page Configuration (Wide layout for a modern website feel)
st.set_page_config(page_title="Cognitive Balance", layout="wide", initial_sidebar_state="expanded")

# 2. Main Header
st.title("Cognitive Balance")
st.markdown("### Support healthier routines, focus, and balance.")

# 3. Initialize Memory (Session State)
if 'schedule' not in st.session_state:
    st.session_state.schedule = pd.DataFrame([
        {'Task': 'Operating Systems Coursework', 'Category': 'Deep Work', 'Hours': 3.0},
        {'Task': 'Strength Training (Push Day)', 'Category': 'Physical Recovery', 'Hours': 1.5},
        {'Task': 'Reading Fiction (Dark Mode)', 'Category': 'Mental Rest', 'Hours': 1.0}
    ])
if 'mood' not in st.session_state:
    st.session_state.mood = "Neutral"

# 4. Create Website Tabs (This creates the "Proper Website" navigation)
tab1, tab2, tab3 = st.tabs(["📊 Dashboard & Burnout Predictor", "📅 Schedule Planner", "🧘 Mental Wellness Hub"])

# --- TAB 1: DASHBOARD ---
with tab1:
    st.header("Daily Overview")
    
    df = st.session_state.schedule
    work_hours = df[df['Category'] == "Deep Work"]['Hours'].sum()
    physical_hours = df[df['Category'] == "Physical Recovery"]['Hours'].sum()
    mental_hours = df[df['Category'] == "Mental Rest"]['Hours'].sum()
    total_recovery = physical_hours + mental_hours

    col1, col2, col3 = st.columns(3)
    col1.metric("Intense Work", f"{work_hours} hrs")
    col2.metric("Physical Recovery", f"{physical_hours} hrs")
    col3.metric("Mental Rest", f"{mental_hours} hrs")

    st.subheader("System Status")
    if work_hours > 6 and total_recovery < 2:
        st.error("⚠️ CRITICAL: High cognitive load detected. You must schedule immediate mental rest.")
    elif work_hours > (total_recovery * 2):
        st.warning("⚡ WARNING: Balance is tilting. Add a physical workout or reading session to stabilize.")
    else:
        st.success("✅ OPTIMAL: Your routine is balanced and sustainable.")

# --- TAB 2: SCHEDULE PLANNER ---
with tab2:
    st.header("Task Management")
    col_input, col_table = st.columns([1, 2])
    
    with col_input:
        st.markdown("#### Add New Activity")
        task_name = st.text_input("Activity Name")
        category = st.selectbox("Category", ["Deep Work", "Physical Recovery", "Mental Rest"])
        hours = st.slider("Duration (Hours)", 0.5, 5.0, 1.0, 0.5)
        
        if st.button("Add to Schedule"):
            new_task = pd.DataFrame({'Task': [task_name], 'Category': [category], 'Hours': [hours]})
            st.session_state.schedule = pd.concat([st.session_state.schedule, new_task], ignore_index=True)
            st.success(f"Added '{task_name}'")

    with col_table:
        st.markdown("#### Current Schedule")
        st.dataframe(st.session_state.schedule, use_container_width=True, hide_index=True)

# --- TAB 3: MENTAL WELLNESS HUB ---
with tab3:
    st.header("Mental Wellness & Grounding")
    
    # Feature A: Mood Logging
    st.subheader("1. State of Mind Check-In")
    st.write("Self-awareness is the first step in preventing burnout.")
    mood_input = st.select_slider(
        "How are you feeling right now?",
        options=["Exhausted", "Stressed", "Neutral", "Focused", "Energized"],
        value=st.session_state.mood
    )
    if st.button("Log Mood"):
        st.session_state.mood = mood_input
        st.success(f"Mood logged as: {mood_input}. Adjust your schedule accordingly.")

    st.divider()

    # Feature B: Interactive Breathing Tool
    st.subheader("2. Tactical Reset")
    st.write("Take 15 seconds to lower your heart rate before your next deep work block.")
    if st.button("Start 4-7-8 Breathing Exercise"):
        with st.empty():
            st.info("Breathe IN for 4 seconds...")
            time.sleep(4)
            st.warning("HOLD for 7 seconds...")
            time.sleep(7)
            st.success("Exhale OUT for 8 seconds...")
            time.sleep(8)
            st.write("✅ Reset complete. You are ready to focus.")

    st.divider()

    # Feature C: Recovery Recommendations
    st.subheader("3. Suggested Disconnect Routines")
    st.info("💡 **Digital Detox:** Switch off monitors 1 hour before bed. Reading fiction with enlarged serif fonts in low-light/dark mode reduces eye strain after heavy coding sessions.")
    st.info("💡 **Physical Reset:** Multi-day strength training splits process cortisol and reset your nervous system.")
