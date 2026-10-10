import streamlit as st
import pandas as pd

# 1. Setup the visual layout of the page
st.set_page_config(page_title="Cognitive Balance", layout="centered")
st.title("Cognitive Balance")
st.write("A burnout-prevention tool that treats recovery as a strict requirement.")

# 2. Create a "memory" for the app so it doesn't forget tasks when you click a button
if 'schedule' not in st.session_state:
    # Creating an empty table with three columns
    st.session_state.schedule = pd.DataFrame(columns=['Task', 'Category', 'Hours'])

# 3. Build the Sidebar for user inputs
st.sidebar.header("Add a Block to Your Schedule")
task_name = st.sidebar.text_input("What is the activity?")
category = st.sidebar.selectbox(
    "Select Category", 
    ["Deep Work (Coding/Study)", "Physical Recovery (Workout/Walk)", "Mental Rest (Reading/Sleep)"]
)
hours = st.sidebar.slider("Duration (in Hours)", 0.5, 5.0, 1.0, 0.5)

# 4. What happens when the user clicks the "Add" button
if st.sidebar.button("Add to Schedule"):
    # Package the new task into a mini-table
    new_task = pd.DataFrame({'Task': [task_name], 'Category': [category], 'Hours': [hours]})
    # Glue the new mini-table to our main memory table
    st.session_state.schedule = pd.concat([st.session_state.schedule, new_task], ignore_index=True)
    st.sidebar.success(f"Added {task_name} to your day!")

# 5. Displaying the data and calculating burnout
if not st.session_state.schedule.empty:
    st.subheader("Your Current Workload")
    # Show the table on screen
    st.dataframe(st.session_state.schedule, use_container_width=True)

    # Do the math: Separate work hours from recovery hours
    df = st.session_state.schedule
    work_hours = df[df['Category'] == "Deep Work (Coding/Study)"]['Hours'].sum()
    recovery_hours = df[df['Category'].isin(["Physical Recovery (Workout/Walk)", "Mental Rest (Reading/Sleep)"])]['Hours'].sum()

    # Show the metrics visually
    st.subheader("Burnout Predictor")
    col1, col2 = st.columns(2)
    col1.metric("Intense Work (Hours)", work_hours)
    col2.metric("Recovery (Hours)", recovery_hours)

    # The Burnout Logic
    if work_hours > 6 and recovery_hours < 2:
        st.error("⚠️ Burnout Risk High: You have scheduled heavy mental load without enough physical or mental reset. Force a break.")
    elif work_hours > 0 and recovery_hours == 0:
        st.warning("Careful: You are accumulating cognitive fatigue. Schedule some downtime.")
    else:
        st.success("✅ Optimal Balance: Your workload is sustainable.")
else:
    st.info("Your schedule is empty. Add an activity (like '5-Day Split' or 'OS Assignment') from the sidebar.")
