# Meditation Feature Setup

## Overview
The MMM-Gemini module now includes a guided meditation feature that works with the MMM-StopwatchTimer module to provide visual countdown timers for each meditation step.

## Required Module
Make sure you have MMM-StopwatchTimer installed in your modules directory. It should already be installed at:
`/home/raksank/MagicMirror/modules/MMM-StopwatchTimer/`

## Configuration

Add both modules to your `config/config.js`:

```javascript
{
    module: 'MMM-Gemini',
    position: 'top_left',
    config: {
        apiKey: 'your-api-key-here',
        // ... your existing MMM-Gemini config
    },
},
{
    module: 'MMM-StopwatchTimer',
    config: {
        animation: true,
        sound: true,
        soundFile: 'buzz.wav',
        useNativeSound: true,
        useAlertStyle: true
    },
},
```

## How to Use

1. **Start a meditation session:**
   - Say: "Start a meditation session"
   - Or: "I want to meditate for 5 minutes"

2. **If you don't specify duration:**
   - Kagami will ask: "How long would you like to meditate?"
   - Reply with time like: "5 minutes" or "10 minutes"

3. **During meditation:**
   - Each step will be announced by Kagami
   - Visual timer shows countdown for current step
   - Alert popup shows current instruction

4. **Control commands:**
   - "Skip this step" - Move to next meditation step
   - "Extend this by 30 seconds" - Add time to current step
   - "Stop meditation" - End the session

## How It Works

1. **Duration Division:** Your total time is divided equally among 5 meditation steps:
   - Step 1: Comfortable positioning and breathing
   - Step 2: Focus on breath
   - Step 3: Body relaxation
   - Step 4: Mindfulness and observation
   - Step 5: Return to breath and preparation to finish

2. **Visual Feedback:** 
   - Alert popup shows current instruction
   - MMM-StopwatchTimer shows countdown for current step
   - Status indicator shows meditation progress

3. **Audio Guidance:**
   - Kagami announces each step transition
   - Calm, meditation-appropriate voice guidance

## Example Session

User: "Start a meditation session for 5 minutes"
- Total: 300 seconds ÷ 5 steps = 60 seconds per step
- Each step gets exactly 1 minute
- Visual timer counts down from 60s for each step
- Kagami guides you through each transition

Enjoy your mindful moments! 🧘‍♀️
