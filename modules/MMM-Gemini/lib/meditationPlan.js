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

const { SupabaseClient } = require('./supabaseClient');

// Cache for wellness plans
let cachedWellnessPlans = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch wellness plans from Supabase
 * @returns {Promise<Array>} Array of wellness plans
 */
async function fetchWellnessPlansFromSupabase() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (cachedWellnessPlans && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedWellnessPlans;
  }

  try {
    const supabase = new SupabaseClient();
    const plans = await supabase.getWellnessPlans();
    
    cachedWellnessPlans = plans;
    lastFetchTime = now;
    
    return plans;
  } catch (error) {
    console.error('Error fetching wellness plans from Supabase:', error);
    // Return cached data if available, even if expired
    if (cachedWellnessPlans) {
      console.warn('Using cached wellness plans due to fetch error');
      return cachedWellnessPlans;
    }
    throw error;
  }
}

/**
 * Build a meditation plan based on total duration
 * Fetches meditation instructions from Supabase wellness plans
 * @param {number} totalSeconds - Total duration of meditation in seconds
 * @returns {Promise<Object>} Meditation plan with steps
 */
async function buildPlan(totalSeconds) {
  try {
    const plans = await fetchWellnessPlansFromSupabase();
    
    if (!plans || plans.length === 0) {
      console.warn('No wellness plans found in Supabase, using fallback meditation plan');
      return buildFallbackPlan(totalSeconds);
    }

    // Use the most recent wellness plan
    const selectedPlan = plans[0];
    const planData = selectedPlan.plan_data;

    // Extract meditation tasks from the plan
    const meditationSteps = [];
    
    if (planData.weeks && planData.weeks.length > 0) {
      // Get meditation tasks from the first week (can be made dynamic later)
      const currentWeek = planData.weeks[0];
      
      if (currentWeek.days && currentWeek.days.length > 0) {
        for (const day of currentWeek.days) {
          if (day.tasks && day.tasks.length > 0) {
            for (const task of day.tasks) {
              // Look for meditation-type tasks
              if (task.type === 'meditation' || task.type === 'mindfulness') {
                meditationSteps.push({
                  instruction: task.details || task.activity || 'Continue with your meditation practice.'
                });
              }
            }
          }
        }
      }
    }

    // If we couldn't extract enough steps, use fallback
    if (meditationSteps.length === 0) {
      console.warn('No meditation steps found in wellness plan, using fallback');
      return buildFallbackPlan(totalSeconds);
    }

    // Limit to 5 steps for a good meditation flow
    const steps = meditationSteps.slice(0, 5);
    
    // If we have fewer than 5 steps, add generic mindfulness instructions
    while (steps.length < 5) {
      steps.push({
        instruction: 'Continue to breathe deeply and observe your thoughts without judgment.'
      });
    }

    // Distribute the total time across the steps
    const n = steps.length;
    const per = Math.floor(totalSeconds / n);
    let rem = totalSeconds % n;
    
    return {
      name: selectedPlan.plan_name || 'Guided Meditation',
      totalDuration: totalSeconds,
      steps: steps.map((s, i) => ({
        time: per + (rem-- > 0 ? 1 : 0),
        instruction: s.instruction,
      })),
    };
  } catch (error) {
    console.error('Error building meditation plan from Supabase:', error);
    return buildFallbackPlan(totalSeconds);
  }
}

/**
 * Fallback meditation plan when Supabase data is not available
 * @param {number} totalSeconds - Total duration in seconds
 * @returns {Object} Basic meditation plan
 */
function buildFallbackPlan(totalSeconds) {
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
