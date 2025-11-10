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

// Global Supabase client instance (will be initialized on module start)
let supabaseClient = null;

/**
 * Initialize the Supabase client (called once on module start)
 * @param {SupabaseClient} client - The initialized Supabase client
 */
function initializeSupabaseClient(client) {
  supabaseClient = client;
}

/**
 * Get fitness plans from the prefetched cache
 * @returns {Array} Array of fitness plans from cache
 */
function getFitnessPlansFromCache() {
  if (!supabaseClient) {
    console.error('Supabase client not initialized!');
    return [];
  }
  return supabaseClient.getCachedFitnessPlans();
}

/**
 * Find the most appropriate fitness plan based on target areas
 * @param {string|Array<string>} target - Target area(s) like 'arms', 'legs', 'core', etc.
 * @param {Object} userParams - User parameters (optional, for backwards compatibility)
 * @returns {Promise<Object>} The selected fitness plan with exercises
 */
async function buildWorkoutPlan(target, userParams = {}) {
  try {
    const plans = getFitnessPlansFromCache();
    
    if (!plans || plans.length === 0) {
      throw new Error('No fitness plans found in cache');
    }

    // Normalize target to array
    let targetAreas = Array.isArray(target) ? target : [target];
    targetAreas = targetAreas.map(t => t.toLowerCase());

    // Find the best matching plan based on target areas
    let selectedPlan = null;
    
    // First, try to find an exact match
    for (const plan of plans) {
      const planTargets = plan.target_areas.map(t => t.toLowerCase());
      const matchCount = targetAreas.filter(t => planTargets.includes(t)).length;
      
      if (matchCount === targetAreas.length && matchCount === planTargets.length) {
        selectedPlan = plan;
        break;
      }
    }

    // If no exact match, find plan with most overlapping targets
    if (!selectedPlan) {
      let maxMatch = 0;
      for (const plan of plans) {
        const planTargets = plan.target_areas.map(t => t.toLowerCase());
        const matchCount = targetAreas.filter(t => planTargets.includes(t)).length;
        
        if (matchCount > maxMatch) {
          maxMatch = matchCount;
          selectedPlan = plan;
        }
      }
    }

    // If still no plan found, use the first available plan
    if (!selectedPlan) {
      console.warn(`No plan found matching targets: ${targetAreas.join(', ')}. Using first available plan.`);
      selectedPlan = plans[0];
    }

    // Transform the Supabase plan data into the format expected by the fitness agent
    return transformSupabasePlanToWorkoutFormat(selectedPlan);
  } catch (error) {
    console.error('Error building workout plan:', error);
    throw error;
  }
}

/**
 * Transform Supabase plan data to the format expected by the fitness agent
 * @param {Object} supabasePlan - Plan data from Supabase
 * @returns {Object} Transformed workout plan
 */
function transformSupabasePlanToWorkoutFormat(supabasePlan) {
  const planData = supabasePlan.plan_data;
  
  // Get the current week (for simplicity, we'll use week 1, but this could be made dynamic)
  const currentWeekIndex = 0;
  const currentWeek = planData.weeks[currentWeekIndex];
  
  // Get all non-rest day exercises from the current week
  const exercises = [];
  let exerciseNumber = 1;
  
  for (const day of currentWeek.days) {
    if (!day.rest_day && day.tasks && day.tasks.length > 0) {
      for (const task of day.tasks) {
        // Skip warm-up and cool-down exercises for the workout routine
        if (task.exercise && 
            !task.exercise.toLowerCase().includes('warm-up') && 
            !task.exercise.toLowerCase().includes('cool-down')) {
          
          exercises.push({
            exerciseNumber: exerciseNumber++,
            exercise: task.exercise,
            reps: task.details || 'As specified',
            instruction: task.instructions || task.details || '',
            restAfter: 30 // Default rest time, can be adjusted based on difficulty
          });
        }
      }
    }
  }

  // Determine fitness level from the plan data or default to intermediate
  const difficulty = planData.plan_overview?.difficulty || 'intermediate';
  
  return {
    name: supabasePlan.plan_name || 'Custom Workout Plan',
    target: supabasePlan.target_areas.join(', '),
    fitnessLevel: difficulty,
    restTime: difficulty === 'beginner' ? 45 : difficulty === 'intermediate' ? 30 : 20,
    totalExercises: exercises.length,
    exercises: exercises
  };
}

/**
 * Calculate BMI (kept for backwards compatibility)
 */
function calculateBMI(weight, height) {
  return weight / (height * height);
}

/**
 * Determine fitness level (kept for backwards compatibility)
 */
function determineFitnessLevel(userParams) {
  const { age, bmi, fitnessExperience } = userParams;
  
  if (fitnessExperience === 'none' || bmi > 30 || age > 65) {
    return 'beginner';
  } else if (fitnessExperience === 'some' || (bmi >= 25 && bmi <= 30) || (age >= 50 && age <= 65)) {
    return 'intermediate';
  } else {
    return 'advanced';
  }
}

/**
 * Get available target areas from Supabase plans
 */
function getAvailableTargets() {
  try {
    const plans = getFitnessPlansFromCache();
    const targets = new Set();
    
    for (const plan of plans) {
      if (plan.target_areas) {
        plan.target_areas.forEach(target => targets.add(target.toLowerCase()));
      }
    }
    
    return Array.from(targets);
  } catch (error) {
    console.error('Error getting available targets:', error);
    return ['arms', 'legs', 'core', 'back', 'fullbody']; // Fallback defaults
  }
}

/**
 * Get all available fitness plans (no auto-selection)
 * @returns {Array} Array of all fitness plans from cache
 */
function getAllFitnessPlans() {
  try {
    const plans = getFitnessPlansFromCache();
    
    if (!plans || plans.length === 0) {
      return [];
    }

    // Return simplified plan info for user selection
    return plans.map(plan => ({
      id: plan.id,
      name: plan.plan_name,
      targetAreas: plan.target_areas,
      duration: plan.duration_weeks,
      fullPlan: plan // Keep full plan data for later use
    }));
  } catch (error) {
    console.error('Error getting all fitness plans:', error);
    return [];
  }
}

/**
 * Get the next incomplete workout from a specific plan
 * @param {string} planId - The plan ID
 * @returns {Promise<Object>} Next incomplete workout with exercises
 */
async function getNextIncompleteWorkout(planId) {
  try {
    if (!supabaseClient) {
      throw new Error('Supabase client not initialized');
    }
    
    const plans = getFitnessPlansFromCache();
    
    // Find the plan
    const plan = plans.find(p => p.id === planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Get completed days
    const completedDays = await supabaseClient.getCompletedDays(planId);
    const completedSet = new Set(completedDays);

    // Find the first incomplete day
    const planData = plan.plan_data;
    
    for (const week of planData.weeks) {
      for (const day of week.days) {
        const dayId = `week${week.week_number}_day${day.day_number}`;
        
        // Skip rest days and completed days
        if (day.rest_day || completedSet.has(dayId)) {
          continue;
        }

        // Found an incomplete workout!
        return {
          planId: plan.id,
          planName: plan.plan_name,
          weekNumber: week.week_number,
          dayNumber: day.day_number,
          dayId: dayId,
          focus: day.focus,
          exercises: extractExercisesFromDay(day),
          targetAreas: plan.target_areas
        };
      }
    }

    // All workouts completed
    return null;
  } catch (error) {
    console.error('Error getting next incomplete workout:', error);
    throw error;
  }
}

/**
 * Extract exercises from a day's tasks
 * @param {Object} day - Day object from plan data
 * @returns {Array} Array of exercises
 */
function extractExercisesFromDay(day) {
  const exercises = [];
  let exerciseNumber = 1;

  if (!day.tasks || day.tasks.length === 0) {
    return exercises;
  }

  for (const task of day.tasks) {
    // Skip warm-up and cool-down exercises
    if (task.exercise && 
        !task.exercise.toLowerCase().includes('warm-up') && 
        !task.exercise.toLowerCase().includes('cool-down')) {
      
      exercises.push({
        exerciseNumber: exerciseNumber++,
        exercise: task.exercise,
        reps: task.details || 'As specified',
        instruction: task.instructions || task.details || '',
        difficulty: task.difficulty || 'intermediate'
      });
    }
  }

  return exercises;
}

/**
 * Build workout from a specific plan and day (used by new workflow)
 * @param {string} planId - The plan ID
 * @param {number} weekNumber - Week number
 * @param {number} dayNumber - Day number
 * @returns {Promise<Object>} Workout details
 */
async function buildWorkoutFromPlanDay(planId, weekNumber, dayNumber) {
  try {
    const plans = getFitnessPlansFromCache();
    const plan = plans.find(p => p.id === planId);
    
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const planData = plan.plan_data;
    const week = planData.weeks.find(w => w.week_number === weekNumber);
    
    if (!week) {
      throw new Error(`Week ${weekNumber} not found in plan`);
    }

    const day = week.days.find(d => d.day_number === dayNumber);
    
    if (!day) {
      throw new Error(`Day ${dayNumber} not found in week ${weekNumber}`);
    }

    const exercises = extractExercisesFromDay(day);
    const difficulty = planData.plan_overview?.difficulty || 'intermediate';
  
  return {
      planId: plan.id,
      name: `${plan.plan_name} - ${day.focus}`,
      target: plan.target_areas.join(', '),
      fitnessLevel: difficulty,
      restTime: difficulty === 'beginner' ? 45 : difficulty === 'intermediate' ? 30 : 20,
    totalExercises: exercises.length,
      exercises: exercises,
      weekNumber: weekNumber,
      dayNumber: dayNumber,
      dayId: `week${weekNumber}_day${dayNumber}`,
      focus: day.focus
    };
  } catch (error) {
    console.error('Error building workout from plan day:', error);
    throw error;
  }
}

module.exports = { 
  initializeSupabaseClient, // Initialize the client with prefetched data
  buildWorkoutPlan, 
  calculateBMI, 
  determineFitnessLevel,
  availableTargets: ['arms', 'legs', 'core', 'back', 'fullbody', 'shoulders', 'glutes'], // Static list for immediate access
  getAvailableTargets, // Dynamic function to get actual targets from cache
  getAllFitnessPlans, // Get all plans for user selection from cache
  getNextIncompleteWorkout, // Get next incomplete workout from a plan
  buildWorkoutFromPlanDay // Build specific workout from plan/week/day
};
