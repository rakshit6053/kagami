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

class WellnessAgent {
  constructor({ notifyFront, speak, log, warn, error }) {
    this.notifyFront = notifyFront; // fn(notification, payload) => frontend relays to other modules
    this.speak = speak; // fn(text) => AI speech synthesis
    this.log = log;
    this.warn = warn;
    this.error = error;
    this.timer = null;
    this.session = null;
  }

  async start({ totalSeconds }) {
    const { buildPlan } = require('./meditationPlan');
    this.clear();
    // buildPlan is now async, so we need to await it
    const plan = await buildPlan(totalSeconds);
    this.session = { plan, idx: 0 };
    this.log(`Starting meditation session: ${plan.totalDuration}s total, ${plan.steps.length} steps`);
    await this._announceAndRunCurrent();
  }

  async control({ action, seconds }) {
    if (!this.session) {
      this.warn("Control action attempted but no active meditation session");
      return;
    }
    
    this.log(`Meditation control: ${action}, seconds: ${seconds}`);
    
    switch (action) {
      case 'skip':
        await this._next();
        break;
      case 'extend':
        if (this.timer && this.session.remaining != null) {
          const extendBy = Math.max(1, Math.floor(seconds || 30));
          this.session.remaining += extendBy;
          this.log(`Extending current step by ${extendBy} seconds. New remaining: ${this.session.remaining}`);
          
          // Restart the timer with updated remaining time
          clearTimeout(this.timer);
          this._startTimer(this.session.remaining);
          
          // Update the visual timer as well
          this.notifyFront('START_TIMER', this.session.remaining);
        }
        break;
      case 'stop':
        await this._end(true); // true = user stopped
        break;
    }
  }

  async _announceAndRunCurrent() {
    const step = this._currentStep();
    if (!step) { 
      await this._end(false); // false = natural completion
      return; 
    }

    this.log(`Starting meditation step ${this.session.idx + 1}/${this.session.plan.steps.length}: "${step.instruction}" (${step.time}s)`);

    // Show instruction in UI first
    const stepPayload = {
      instruction: step.instruction,
      seconds: step.time,
      stepNumber: this.session.idx + 1,
      totalSteps: this.session.plan.steps.length,
    };
    this.log(`Sending MEDITATION_STEP notification:`, stepPayload);
    this.notifyFront('MEDITATION_STEP', stepPayload);

    // Start the visible countdown on MMM-StopwatchTimer
    this.notifyFront('START_TIMER', step.time);

    // AI announces the instruction (after a short delay to let UI update)
    setTimeout(async () => {
      const stepText = `${step.instruction}`;
      await this.speak(stepText);
    }, 800); // Slightly longer delay to ensure alert is shown first

    // Track remaining time and set completion callback
    this._startTimer(step.time);
  }

  _startTimer(seconds) {
    this.session.remaining = seconds;
    this.timer = setTimeout(async () => {
      this.timer = null;
      this.session.remaining = null;
      this.log(`Meditation step ${this.session.idx + 1} completed`);
      this.notifyFront('MEDITATION_STEP_DONE', { idx: this.session.idx });
      await this._next();
    }, seconds * 1000);
  }

  async _next() {
    if (!this.session) return;
    this.session.idx += 1;
    await this._announceAndRunCurrent();
  }

  _currentStep() {
    if (!this.session) return null;
    const { plan, idx } = this.session;
    return plan.steps[idx] || null;
  }

  async _end(userStopped = false) {
    if (userStopped) {
      await this.speak("Your meditation has ended. Take a moment to notice how you feel.");
      this.notifyFront('MEDITATION_ENDED');
    } else {
      await this.speak("Your meditation is complete. Take a deep breath and slowly open your eyes when you're ready.");
      this.notifyFront('MEDITATION_COMPLETED');
    }
    
    this.clear();
  }

  clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.session = null;
    this.log("Meditation session cleared");
  }

  // Get current session status for debugging
  getStatus() {
    if (!this.session) return { active: false };
    
    return {
      active: true,
      currentStep: this.session.idx + 1,
      totalSteps: this.session.plan.steps.length,
      remainingTime: this.session.remaining,
      currentInstruction: this._currentStep()?.instruction,
    };
  }
}

module.exports = { WellnessAgent };
