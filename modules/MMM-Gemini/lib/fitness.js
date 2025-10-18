/*
Copyright 2025 Paul Trebilcox-Ruiz

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

class FitnessAgent {
  constructor({ notifyFront, speak, log, warn, error }) {
    this.notifyFront = notifyFront; // fn(notification, payload) => frontend relays to other modules
    this.speak = speak; // fn(text) => AI speech synthesis
    this.log = log;
    this.warn = warn;
    this.error = error;
    this.restTimer = null;
    this.session = null;
    this.isResting = false;
  }

  async start({ target, userParams }) {
    const { buildWorkoutPlan } = require('./fitnessPlans');
    this.clear();
    
    try {
      const plan = buildWorkoutPlan(target, userParams);
      this.session = { plan, exerciseIndex: 0, userParams };
      
      this.log(`Starting fitness session: ${plan.name}, ${plan.totalExercises} exercises`);
      
      // Notify frontend about workout start
      this.notifyFront('FITNESS_SESSION_STARTED', {
        target: plan.target,
        fitnessLevel: plan.fitnessLevel,
        totalExercises: plan.totalExercises,
        workoutName: plan.name
      });
      
      await this._announceAndRunCurrentExercise();
    } catch (error) {
      this.error("Error starting fitness session:", error);
      throw error;
    }
  }

  async control({ action, seconds }) {
    if (!this.session) {
      this.warn("Control action attempted but no active fitness session");
      return;
    }
    
    this.log(`Fitness control: ${action}, seconds: ${seconds}`);
    
    switch (action) {
      case 'skip':
        if (this.isResting) {
          await this._endRest();
        } else {
          await this._nextExercise();
        }
        break;
      case 'extend':
        if (this.isResting && this.restTimer) {
          const extendBy = Math.max(1, Math.floor(seconds || 15));
          this.log(`Extending rest by ${extendBy} seconds`);
          
          // Update rest time and restart timer
          clearTimeout(this.restTimer);
          this._startRestTimer(extendBy);
          
          this.notifyFront('REST_EXTENDED', { additionalSeconds: extendBy });
        }
        break;
      case 'stop':
        await this._end(true); // true = user stopped
        break;
    }
  }

  async _announceAndRunCurrentExercise() {
    const exercise = this._currentExercise();
    if (!exercise) { 
      await this._end(false); // false = natural completion
      return; 
    }

    this.log(`Starting exercise ${this.session.exerciseIndex + 1}/${this.session.plan.totalExercises}: "${exercise.exercise}" (${exercise.reps})`);

    // Show exercise in UI
    const exercisePayload = {
      exercise: exercise.exercise,
      reps: exercise.reps,
      instruction: exercise.instruction,
      exerciseNumber: exercise.exerciseNumber,
      totalExercises: this.session.plan.totalExercises,
      target: this.session.plan.target,
      fitnessLevel: this.session.plan.fitnessLevel
    };
    
    this.log(`Sending FITNESS_EXERCISE notification:`, exercisePayload);
    this.notifyFront('FITNESS_EXERCISE', exercisePayload);

    // AI announces the exercise (after a short delay to let UI update)
    setTimeout(async () => {
      const exerciseText = `Exercise ${exercise.exerciseNumber}: ${exercise.exercise}. ${exercise.reps} repetitions. ${exercise.instruction}`;
      await this.speak(exerciseText);
      
      // After announcing, wait for user to signal completion
      this.log(`Exercise announced. Waiting for user to complete: ${exercise.exercise}`);
    }, 800);
  }

  async _nextExercise() {
    if (!this.session) return;
    
    const currentExercise = this._currentExercise();
    if (currentExercise && currentExercise.restAfter > 0) {
      // Start rest period
      await this._startRest(currentExercise.restAfter);
    } else {
      // No rest needed, go to next exercise
      this.session.exerciseIndex += 1;
      await this._announceAndRunCurrentExercise();
    }
  }

  async _startRest(restSeconds) {
    this.isResting = true;
    this.log(`Starting rest period: ${restSeconds} seconds`);
    
    // Notify frontend about rest period
    this.notifyFront('FITNESS_REST_STARTED', { 
      restSeconds,
      nextExercise: this.session.exerciseIndex + 1 < this.session.plan.totalExercises ? 
        this.session.plan.exercises[this.session.exerciseIndex + 1].exercise : null
    });
    
    // Start countdown timer
    this.notifyFront('START_TIMER', restSeconds);
    
    // AI announces rest
    await this.speak(`Great job! Take a ${restSeconds} second rest. Get ready for the next exercise.`);
    
    this._startRestTimer(restSeconds);
  }

  _startRestTimer(seconds) {
    this.restTimer = setTimeout(async () => {
      await this._endRest();
    }, seconds * 1000);
  }

  async _endRest() {
    if (this.restTimer) {
      clearTimeout(this.restTimer);
      this.restTimer = null;
    }
    
    this.isResting = false;
    this.log("Rest period ended");
    
    this.notifyFront('FITNESS_REST_ENDED');
    
    // Move to next exercise
    this.session.exerciseIndex += 1;
    await this._announceAndRunCurrentExercise();
  }

  _currentExercise() {
    if (!this.session) return null;
    const { plan, exerciseIndex } = this.session;
    return plan.exercises[exerciseIndex] || null;
  }

  async _end(userStopped = false) {
    if (userStopped) {
      await this.speak("Your workout has ended. Great effort today! Remember to stretch and stay hydrated.");
      this.notifyFront('FITNESS_SESSION_ENDED', { completed: false });
    } else {
      await this.speak("Congratulations! You've completed your workout. Excellent work! Don't forget to cool down and stretch.");
      this.notifyFront('FITNESS_SESSION_COMPLETED', { completed: true });
    }
    
    this.clear();
  }

  clear() {
    if (this.restTimer) {
      clearTimeout(this.restTimer);
      this.restTimer = null;
    }
    this.session = null;
    this.isResting = false;
    this.log("Fitness session cleared");
  }

  // Get current session status for debugging
  getStatus() {
    if (!this.session) return { active: false };
    
    return {
      active: true,
      currentExercise: this.session.exerciseIndex + 1,
      totalExercises: this.session.plan.totalExercises,
      isResting: this.isResting,
      target: this.session.plan.target,
      fitnessLevel: this.session.plan.fitnessLevel,
      currentExerciseDetails: this._currentExercise(),
    };
  }
}

module.exports = { FitnessAgent };
