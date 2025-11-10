# Supabase Integration for MMM-Gemini

## Overview
The MMM-Gemini module has been successfully integrated with Supabase to fetch personalized fitness and wellness plans instead of using hardcoded data. This allows the AI agents to provide personalized recommendations based on actual user data stored in the database.

## What Changed

### New Files Created

1. **`lib/supabaseConfig.js`**
   - Contains Supabase URL, anonymous API key, and user ID
   - Centralized configuration for all Supabase-related operations

2. **`lib/supabaseClient.js`**
   - Main client for interacting with Supabase
   - Provides methods to fetch:
     - User data
     - Fitness plans
     - Wellness plans
     - Fitness profiles
     - Wellness profiles
   - Includes fallback for Node.js versions without native `fetch`

### Modified Files

1. **`lib/fitnessPlans.js`**
   - **Before**: Used hardcoded fitness plans for different body parts and fitness levels
   - **After**: Fetches fitness plans from Supabase database
   - Implements caching (5 minutes) to reduce API calls
   - Matches workout plans based on target areas
   - Transforms Supabase data format to the format expected by the fitness agent
   - Fallback to cached data if fetch fails

2. **`lib/meditationPlan.js`**
   - **Before**: Used hardcoded meditation steps
   - **After**: Fetches wellness plans from Supabase database
   - Extracts meditation and mindfulness tasks from wellness plans
   - Implements caching (5 minutes) to reduce API calls
   - Fallback to basic meditation plan if Supabase data unavailable

3. **`lib/fitness.js`**
   - Updated to handle async `buildWorkoutPlan` function
   - Added `await` for plan fetching from Supabase

4. **`lib/wellness.js`**
   - Updated to handle async `buildPlan` function
   - Added `await` for meditation plan fetching from Supabase

### Database Changes

Created RLS (Row Level Security) policies to allow anonymous access for reading:
- `fitness_plans` table
- `wellness_plans` table
- `users` table
- `fitness_profiles` table
- `wellness_profiles` table

This allows the MagicMirror to fetch data using the anonymous API key without requiring authentication.

## How It Works

### Fitness Agent Flow

1. User activates fitness mode via voice command
2. AI agent calls `buildWorkoutPlan(target, userParams)`
3. Function fetches fitness plans from Supabase for user ID: `6903aa9c-f7a8-4820-8d01-9a678f1c8832`
4. Finds best matching plan based on target areas (e.g., "legs", "shoulders")
5. Transforms plan data into workout format
6. AI reads out exercises with instructions and manages rest periods

### Wellness Agent Flow

1. User activates meditation mode via voice command
2. AI agent calls `buildPlan(totalSeconds)`
3. Function fetches wellness plans from Supabase
4. Extracts meditation tasks from the plan
5. Distributes time across meditation steps
6. AI guides user through each meditation step

## User Data

The system is currently configured to fetch data for:
- **User ID**: `6903aa9c-f7a8-4820-8d01-9a678f1c8832`
- **Name**: Rakshit
- **Age**: 20
- **Location**: Bengaluru

### Available Plans

**Fitness Plans:**
- "legs, shoulders Plan" (2 weeks, intermediate)
- "legs, glutes Plan" (2 weeks, intermediate)

**Wellness Plans:**
- "2-Week Wellness Journey" (guided meditation)

## Performance Features

### Caching
- Both fitness and wellness plans are cached for 5 minutes
- Reduces API calls and improves response time
- Stale cache is used as fallback if fetch fails

### Error Handling
- Graceful fallback to cached data
- Fallback to basic meditation plan if wellness data unavailable
- Detailed error logging for debugging

### Compatibility
- Supports Node.js 18+ with native `fetch`
- Falls back to `node-fetch` for older Node versions

## Configuration

To change the user ID or update Supabase credentials, edit:
```javascript
// lib/supabaseConfig.js
const SUPABASE_CONFIG = {
  url: 'https://agdwmrzewhgopfeinydh.supabase.co',
  anonKey: 'your-anon-key-here',
  userId: 'your-user-id-here'
};
```

## Testing

The integration has been tested and verified:
- ✓ User data fetched successfully
- ✓ Fitness plans retrieved (2 plans found)
- ✓ Wellness plans retrieved (1 plan found)
- ✓ Workout plan generation working
- ✓ Meditation plan generation working
- ✓ All data structures compatible with existing agents

## Benefits

1. **Personalization**: Plans are specific to the user's goals and fitness level
2. **Dynamic**: Plans can be updated in the database without code changes
3. **Scalable**: Easy to add more users or plans
4. **Maintainable**: Separation of data from code logic
5. **Flexible**: Can easily extend to fetch other types of data (nutrition, wardrobe, etc.)

## Future Enhancements

Potential improvements:
- Multi-user support with voice recognition
- Progress tracking and workout history
- Dynamic week selection based on user progress
- Integration with fitness profiles for better personalization
- Real-time plan updates when database changes

