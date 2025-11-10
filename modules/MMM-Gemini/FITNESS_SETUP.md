# Fitness Agent Setup

## Overview
The fitness agent provides interactive workout sessions through voice commands, similar to the meditation agent. Users can start workouts targeting specific muscle groups and receive guided exercise instructions.

## User Parameters
The system includes basic user parameters that affect workout intensity:
- **Age**: 30 (default)
- **Weight**: 70 kg (default)
- **Height**: 1.75 meters (default)
- **Fitness Experience**: 'some' (default - options: 'none', 'some', 'experienced')
- **BMI**: Automatically calculated from weight and height

## Available Target Areas
- **arms**: Upper body exercises focusing on biceps, triceps, and shoulders
- **legs**: Lower body exercises including squats, lunges, and calf raises
- **core**: Abdominal and core strengthening exercises
- **back**: Back and posterior chain exercises
- **fullbody**: Combined exercises targeting multiple muscle groups

## Fitness Levels
Based on user parameters, workouts are automatically adjusted to three levels:
- **Beginner**: Lower rep counts, simpler movements, longer rest periods (45s)
- **Intermediate**: Moderate intensity, compound movements, medium rest (30s)
- **Advanced**: Higher intensity, complex movements, shorter rest (20s)

## Voice Commands

### Starting a Workout
- "Let's start my workout"
- "I want to exercise"
- "Start a fitness session"

The AI will then ask for the target area if not specified.

### During Workout
- **Next Exercise**: "done", "finished", "next", "continue", "completed"
- **Skip Exercise**: "skip to exercise 3", "go to last exercise"
- **End Session**: "stop", "end workout", "quit", "finish"
- **Force Exit**: "switch to push to talk", "peaches"

## Example Workout Flow

1. **User**: "Let's start my workout"
2. **AI**: "What muscle group would you like to target? I can guide you through exercises for arms, legs, core, back, or a full body workout."
3. **User**: "Arms"
4. **AI**: Starts arms workout based on user's fitness level
5. **AI**: "Exercise 1: Push-ups. 10-20 repetitions. Standard push-ups, keep body straight, chest to ground."
6. **User**: "Done"
7. **AI**: Moves to next exercise or announces rest period
8. **User**: "Stop" (to end early) or continue until all exercises completed

## Files Structure
- `lib/fitnessPlans.js`: Exercise definitions and workout plan generation
- `lib/fitness.js`: Fitness agent class for session management
- `node_helper.js`: Main integration with voice AI system

## Customization
To modify user parameters, edit the `userParams` object in `node_helper.js`:
```javascript
userParams: {
    age: 25,           // Your age
    weight: 65,        // Your weight in kg
    height: 1.70,      // Your height in meters
    fitnessExperience: 'experienced' // none, some, experienced
}
```

## Features
- Automatic fitness level detection based on user parameters
- Adaptive exercise selection per fitness level
- Voice-guided exercise instructions
- Rest period management between exercises
- Progress tracking through workout session
- Emergency exit commands
- Integration with existing meditation system
