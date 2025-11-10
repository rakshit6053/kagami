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

// Global Supabase client instance (set by node_helper)
let supabaseClientInstance = null;

/**
 * Initialize the Supabase client instance
 * @param {SupabaseClient} client - The Supabase client instance
 */
function initializeSupabaseClient(client) {
  supabaseClientInstance = client;
}

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

/**
 * Get all available wellness plans from cache
 * @returns {Array} Array of wellness plan summaries with id, name, focus, duration
 */
function getAllWellnessPlans() {
  if (!supabaseClientInstance) {
    console.error('[getAllWellnessPlans] Supabase client not initialized');
    return [];
  }

  const plans = supabaseClientInstance.getCachedWellnessPlans();
  
  if (!plans || plans.length === 0) {
    console.log('[getAllWellnessPlans] No wellness plans found in cache');
    return [];
  }

  // Return simplified plan information for AI
  return plans.map(plan => ({
    id: plan.id,
    name: plan.plan_name,
    focus: plan.meditation_style || 'Mindfulness', // wellness_plans uses meditation_style, not focus_areas
    duration: `${plan.duration_weeks || 1} week${plan.duration_weeks > 1 ? 's' : ''}`
  }));
}

/**
 * Get the next incomplete wellness session for a specific plan
 * @param {string} planId - The wellness plan UUID
 * @returns {Promise<Object|null>} Next incomplete session or null if all complete
 */
async function getNextIncompleteSession(planId) {
  if (!supabaseClientInstance) {
    console.error('[getNextIncompleteSession] Supabase client not initialized');
    return null;
  }

  try {
    const plans = supabaseClientInstance.getCachedWellnessPlans();
    const plan = plans.find(p => p.id === planId);
    
    if (!plan) {
      console.error(`[getNextIncompleteSession] Plan not found: ${planId}`);
      return null;
    }

    // Get wellness progress for this plan
    const progress = await supabaseClientInstance.getWellnessProgress(planId);
    const completedDays = await supabaseClientInstance.getCompletedWellnessDays(planId);
    
    console.log(`[getNextIncompleteSession] Plan: ${plan.plan_name}, Completed days:`, completedDays);

    const planData = plan.plan_data;
    if (!planData.weeks || planData.weeks.length === 0) {
      console.error(`[getNextIncompleteSession] No weeks found in plan data`);
      return null;
    }

    // Iterate through weeks and days to find first incomplete
    for (const week of planData.weeks) {
      const weekNumber = week.week_number;
      
      if (!week.days || week.days.length === 0) continue;
      
      for (const day of week.days) {
        const dayNumber = day.day_number;
        
        // Check if this day is completed
        const isCompleted = completedDays.some(
          cd => cd.week === weekNumber && cd.day === dayNumber
        );
        
        if (!isCompleted) {
          console.log(`[getNextIncompleteSession] Found incomplete session: Week ${weekNumber}, Day ${dayNumber}`);
          return {
            planId: plan.id,
            planName: plan.plan_name,
            weekNumber,
            dayNumber,
            focus: day.focus || week.focus || 'Mindfulness Practice',
            totalDays: planData.weeks.reduce((sum, w) => sum + (w.days?.length || 0), 0)
          };
        }
      }
    }

    console.log(`[getNextIncompleteSession] All sessions completed for plan ${planId}`);
    return null; // All sessions completed
  } catch (error) {
    console.error('[getNextIncompleteSession] Error:', error);
    return null;
  }
}

/**
 * Build a meditation/wellness session from a specific plan day
 * @param {string} planId - The wellness plan UUID
 * @param {number} weekNumber - Week number (1-indexed)
 * @param {number} dayNumber - Day number (1-indexed)
 * @returns {Promise<Object>} Detailed session plan with steps
 */
async function buildSessionFromPlanDay(planId, weekNumber, dayNumber) {
  if (!supabaseClientInstance) {
    console.error('[buildSessionFromPlanDay] Supabase client not initialized');
    throw new Error('Supabase client not initialized');
  }

  try {
    const plans = supabaseClientInstance.getCachedWellnessPlans();
    const plan = plans.find(p => p.id === planId);
    
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const planData = plan.plan_data;
    const week = planData.weeks[weekNumber - 1];
    
    if (!week) {
      throw new Error(`Week ${weekNumber} not found in plan`);
    }

    const day = week.days[dayNumber - 1];
    
    if (!day) {
      throw new Error(`Day ${dayNumber} not found in week ${weekNumber}`);
    }

    // Extract meditation/wellness tasks
    const tasks = day.tasks || [];
    const steps = [];
    
    for (const task of tasks) {
      steps.push({
        instruction: task.details || task.activity || 'Continue with your mindfulness practice.',
        duration: task.duration_minutes || 2 // Default 2 minutes per step
      });
    }

    // If no tasks, create a basic session
    if (steps.length === 0) {
      steps.push(
        { instruction: 'Find a comfortable position and close your eyes.', duration: 1 },
        { instruction: 'Take slow, deep breaths. Focus on the sensation of breathing.', duration: 2 },
        { instruction: 'Notice any thoughts that arise, and gently let them pass.', duration: 2 },
        { instruction: 'Bring your attention back to your breath whenever your mind wanders.', duration: 2 },
        { instruction: 'Slowly open your eyes when you are ready.', duration: 1 }
      );
    }

    return {
      planId,
      planName: plan.plan_name,
      weekNumber,
      dayNumber,
      focus: day.focus || week.focus || 'Mindfulness Practice',
      totalSteps: steps.length,
      steps: steps.map((step, idx) => ({
        stepNumber: idx + 1,
        instruction: step.instruction,
        duration: step.duration
      }))
    };
  } catch (error) {
    console.error('[buildSessionFromPlanDay] Error:', error);
    throw error;
  }
}

module.exports = { 
  buildPlan, 
  initializeSupabaseClient,
  getAllWellnessPlans,
  getNextIncompleteSession,
  buildSessionFromPlanDay
};
