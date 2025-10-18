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

// Fitness plans for different target areas and fitness levels
const fitnessPlans = {
  arms: {
    beginner: [
      { exercise: "Wall push-ups", reps: "10-15", instruction: "Stand arm's length from wall, push against it. Focus on controlled movement." },
      { exercise: "Arm circles", reps: "10 forward, 10 backward", instruction: "Extend arms to sides, make small circles, gradually increase size." },
      { exercise: "Modified tricep dips", reps: "8-12", instruction: "Use a sturdy chair, keep feet on ground, lower and raise your body." },
      { exercise: "Bicep curls (no weights)", reps: "10-15", instruction: "Flex arms up and down, squeeze biceps at the top." },
      { exercise: "Shoulder shrugs", reps: "15", instruction: "Lift shoulders to ears, hold for 2 seconds, release." }
    ],
    intermediate: [
      { exercise: "Push-ups", reps: "10-20", instruction: "Standard push-ups, keep body straight, chest to ground." },
      { exercise: "Pike push-ups", reps: "8-12", instruction: "Downward dog position, push up focusing on shoulders." },
      { exercise: "Tricep dips", reps: "10-15", instruction: "Feet elevated, lower body using triceps, push back up." },
      { exercise: "Plank to downward dog", reps: "10", instruction: "Start in plank, push hips up to downward dog, return to plank." },
      { exercise: "Diamond push-ups", reps: "8-12", instruction: "Hands form diamond shape, targets triceps more intensely." }
    ],
    advanced: [
      { exercise: "One-arm push-ups progression", reps: "5-8 each arm", instruction: "Start with assisted one-arm push-ups, work toward full movement." },
      { exercise: "Handstand push-ups", reps: "5-10", instruction: "Against wall, lower head to ground and push back up." },
      { exercise: "Archer push-ups", reps: "6-10 each side", instruction: "Wide grip, shift weight to one arm while extending the other." },
      { exercise: "Pseudo planche push-ups", reps: "8-12", instruction: "Hands by ribs, lean forward, push up maintaining forward lean." },
      { exercise: "Ring/TRX tricep extensions", reps: "10-15", instruction: "If available, lean forward and extend arms overhead." }
    ]
  },
  
  legs: {
    beginner: [
      { exercise: "Bodyweight squats", reps: "10-15", instruction: "Feet shoulder-width apart, sit back like sitting in chair." },
      { exercise: "Wall sits", reps: "20-30 seconds", instruction: "Back against wall, slide down to sitting position, hold." },
      { exercise: "Calf raises", reps: "15-20", instruction: "Rise up on toes, hold briefly, lower slowly." },
      { exercise: "Lunges", reps: "8-10 each leg", instruction: "Step forward, lower back knee toward ground, push back up." },
      { exercise: "Glute bridges", reps: "10-15", instruction: "Lie on back, lift hips up, squeeze glutes at top." }
    ],
    intermediate: [
      { exercise: "Jump squats", reps: "10-15", instruction: "Regular squat but explode up into a jump, land softly." },
      { exercise: "Bulgarian split squats", reps: "10-12 each leg", instruction: "Rear foot elevated, lunge down on front leg." },
      { exercise: "Single-leg calf raises", reps: "10-15 each leg", instruction: "One foot at a time, focus on balance and control." },
      { exercise: "Lateral lunges", reps: "10-12 each side", instruction: "Step wide to one side, sit into that hip, push back." },
      { exercise: "Single-leg glute bridges", reps: "8-12 each leg", instruction: "One leg extended, lift hips using other leg." }
    ],
    advanced: [
      { exercise: "Pistol squats progression", reps: "5-8 each leg", instruction: "Single-leg squat, use assistance as needed to build strength." },
      { exercise: "Jump lunges", reps: "10-15 each leg", instruction: "Explosive switch between lunge positions in mid-air." },
      { exercise: "Single-leg deadlifts", reps: "8-10 each leg", instruction: "Hinge at hip on one leg, reach toward ground, return upright." },
      { exercise: "Curtsy lunges", reps: "10-12 each side", instruction: "Step diagonally back and across, lunge down, return to start." },
      { exercise: "Plyometric squat variations", reps: "8-12", instruction: "Mix of jump squats, squat jacks, and explosive movements." }
    ]
  },
  
  core: {
    beginner: [
      { exercise: "Plank", reps: "20-30 seconds", instruction: "Hold straight line from head to heels, engage core." },
      { exercise: "Modified crunches", reps: "10-15", instruction: "Knees bent, hands behind head, lift shoulders off ground." },
      { exercise: "Dead bug", reps: "8-10 each side", instruction: "On back, opposite arm and leg extensions, keep core tight." },
      { exercise: "Bird dog", reps: "8-10 each side", instruction: "On hands and knees, extend opposite arm and leg." },
      { exercise: "Knee to chest", reps: "10-15", instruction: "Lying down, bring knees to chest, feel abdominal engagement." }
    ],
    intermediate: [
      { exercise: "Plank variations", reps: "45-60 seconds", instruction: "Standard, side planks, and plank with leg lifts." },
      { exercise: "Bicycle crunches", reps: "15-20 each side", instruction: "Opposite elbow to knee, keep other leg extended." },
      { exercise: "Russian twists", reps: "15-20 each side", instruction: "Seated, lean back slightly, twist torso side to side." },
      { exercise: "Mountain climbers", reps: "15-20 each leg", instruction: "Plank position, alternate bringing knees to chest rapidly." },
      { exercise: "Hollow body hold", reps: "20-30 seconds", instruction: "Press lower back down, lift shoulders and legs off ground." }
    ],
    advanced: [
      { exercise: "Plank to pike", reps: "10-15", instruction: "From plank, jump feet toward hands, jump back to plank." },
      { exercise: "V-ups", reps: "12-18", instruction: "Lying down, simultaneously lift legs and torso to touch toes." },
      { exercise: "Dragon flags", reps: "5-8", instruction: "Advanced move: body straight, lower/raise using core only." },
      { exercise: "L-sits", reps: "10-20 seconds", instruction: "Seated, hands beside hips, lift entire body off ground." },
      { exercise: "Hanging leg raises", reps: "8-12", instruction: "If pullup bar available, hang and raise legs to horizontal." }
    ]
  },
  
  back: {
    beginner: [
      { exercise: "Cat-cow stretches", reps: "10-15", instruction: "On hands and knees, arch and round back alternately." },
      { exercise: "Superman", reps: "10-15", instruction: "Lie face down, lift chest and legs off ground simultaneously." },
      { exercise: "Reverse snow angels", reps: "10-15", instruction: "Face down, arms overhead, lift and sweep arms in arc." },
      { exercise: "Wall angels", reps: "10-15", instruction: "Back to wall, slide arms up and down maintaining contact." },
      { exercise: "Prone Y-raises", reps: "10-12", instruction: "Face down, arms in Y position, lift off ground." }
    ],
    intermediate: [
      { exercise: "Superman variations", reps: "12-18", instruction: "Add arm and leg combinations, hold for 2-3 seconds." },
      { exercise: "Reverse fly", reps: "12-15", instruction: "Bent over, arms out to sides, squeeze shoulder blades together." },
      { exercise: "Single-arm row (no weights)", reps: "10-12 each arm", instruction: "Bent over, pull elbow back, squeeze back muscles." },
      { exercise: "Good mornings", reps: "10-15", instruction: "Hands behind head, hinge at hips, feel back muscles engage." },
      { exercise: "Dolphin pose", reps: "8-10", instruction: "Forearms down, push hips up, lower and raise body." }
    ],
    advanced: [
      { exercise: "Archer pull-ups", reps: "5-8 each side", instruction: "If bar available, pull to one side, extend other arm." },
      { exercise: "Inverted rows", reps: "10-15", instruction: "Under table or bar, pull chest up to surface." },
      { exercise: "Back bridge progressions", reps: "Hold 15-30 seconds", instruction: "Work toward full back bridge, start with supported versions." },
      { exercise: "Single-arm Superman", reps: "8-10 each side", instruction: "Lift opposite arm and leg, focus on back engagement." },
      { exercise: "Pull-up negatives", reps: "5-8", instruction: "If bar available, start at top, lower slowly with control." }
    ]
  },
  
  fullbody: {
    beginner: [
      { exercise: "Bodyweight squats", reps: "8-12", instruction: "Full body warm-up, engage legs and core." },
      { exercise: "Modified push-ups", reps: "6-10", instruction: "Knee or wall push-ups, work chest, arms, and core." },
      { exercise: "Plank", reps: "15-20 seconds", instruction: "Total body stabilization, focus on form." },
      { exercise: "Glute bridges", reps: "10-12", instruction: "Activate posterior chain, core stability." },
      { exercise: "Marching in place", reps: "30 seconds", instruction: "Get heart rate up, coordinate full body movement." }
    ],
    intermediate: [
      { exercise: "Burpees", reps: "8-12", instruction: "Squat, jump back to plank, push-up, jump forward, jump up." },
      { exercise: "Mountain climbers", reps: "20-30 seconds", instruction: "Cardio and core, maintain plank position." },
      { exercise: "Squat to press", reps: "10-15", instruction: "Squat down, stand and press arms overhead." },
      { exercise: "Plank jacks", reps: "15-20", instruction: "In plank, jump feet wide and narrow like jumping jacks." },
      { exercise: "Reverse lunge to knee drive", reps: "8-10 each leg", instruction: "Step back, lunge, bring knee up explosively." }
    ],
    advanced: [
      { exercise: "Burpee variations", reps: "10-15", instruction: "Add push-ups, tuck jumps, or single-arm versions." },
      { exercise: "Turkish get-ups", reps: "3-5 each side", instruction: "Complex movement from lying to standing, total body coordination." },
      { exercise: "Sprawls", reps: "10-15", instruction: "Similar to burpee but no jump, focus on speed and flow." },
      { exercise: "Bear crawl", reps: "30-45 seconds", instruction: "Hands and feet only, crawl forward/backward/sideways." },
      { exercise: "Manmakers", reps: "6-10", instruction: "Push-up, row each arm, jump to squat, overhead press." }
    ]
  }
};

// Calculate BMI
function calculateBMI(weight, height) {
  // height in meters, weight in kg
  return weight / (height * height);
}

// Determine fitness level based on user parameters
function determineFitnessLevel(userParams) {
  const { age, bmi, fitnessExperience } = userParams;
  
  // Simple logic - can be enhanced based on more parameters
  if (fitnessExperience === 'none' || bmi > 30 || age > 65) {
    return 'beginner';
  } else if (fitnessExperience === 'some' || (bmi >= 25 && bmi <= 30) || (age >= 50 && age <= 65)) {
    return 'intermediate';
  } else {
    return 'advanced';
  }
}

// Build workout plan based on target and user parameters
function buildWorkoutPlan(target, userParams) {
  if (!fitnessPlans[target]) {
    throw new Error(`Unknown target area: ${target}`);
  }
  
  const fitnessLevel = determineFitnessLevel(userParams);
  const exercises = fitnessPlans[target][fitnessLevel];
  
  // Calculate rest time based on fitness level
  const restTime = {
    beginner: 45,     // 45 seconds rest
    intermediate: 30, // 30 seconds rest  
    advanced: 20      // 20 seconds rest
  }[fitnessLevel];
  
  return {
    name: `${target.charAt(0).toUpperCase() + target.slice(1)} Workout - ${fitnessLevel.charAt(0).toUpperCase() + fitnessLevel.slice(1)}`,
    target,
    fitnessLevel,
    restTime,
    totalExercises: exercises.length,
    exercises: exercises.map((ex, i) => ({
      exerciseNumber: i + 1,
      exercise: ex.exercise,
      reps: ex.reps,
      instruction: ex.instruction,
      restAfter: i < exercises.length - 1 ? restTime : 0 // No rest after last exercise
    }))
  };
}

module.exports = { 
  buildWorkoutPlan, 
  calculateBMI, 
  determineFitnessLevel,
  availableTargets: Object.keys(fitnessPlans)
};
