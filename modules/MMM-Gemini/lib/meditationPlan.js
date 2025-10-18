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

const basePlan = {
  name: "Guided Meditation",
  steps: [
    { instruction: "Sit comfortably, close your eyes, and take slow deep breaths." },
    { instruction: "Focus on your breath. Inhale through your nose, exhale through your mouth." },
    { instruction: "Release tension in your shoulders and relax your body." },
    { instruction: "Observe your thoughts, let them pass without judgment." },
    { instruction: "Gently return focus to your breath. Prepare to open your eyes." },
  ],
};

function buildPlan(totalSeconds) {
  const n = basePlan.steps.length;
  const per = Math.floor(totalSeconds / n);
  let rem = totalSeconds % n;
  
  return {
    name: basePlan.name,
    totalDuration: totalSeconds,
    steps: basePlan.steps.map((s, i) => ({
      time: per + (rem-- > 0 ? 1 : 0),
      instruction: s.instruction,
    })),
  };
}

module.exports = { buildPlan };
