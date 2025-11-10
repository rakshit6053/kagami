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

const { SUPABASE_CONFIG } = require('./supabaseConfig');

// Use native fetch if available (Node.js 18+), otherwise use node-fetch
let fetch;
if (typeof globalThis.fetch === 'function') {
  fetch = globalThis.fetch;
} else {
  try {
    fetch = require('node-fetch');
  } catch (err) {
    console.error('fetch is not available. Please upgrade to Node.js 18+ or install node-fetch');
    throw err;
  }
}

class SupabaseClient {
  constructor() {
    this.baseUrl = SUPABASE_CONFIG.url;
    this.headers = {
      'apikey': SUPABASE_CONFIG.anonKey,
      'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
    this.userId = SUPABASE_CONFIG.userId;
    
    // Prefetched data cache
    this.cache = {
      fitnessPlans: null,
      wellnessPlans: null,
      fitnessProfile: null,
      wellnessProfile: null,
      userData: null,
      wardrobeItems: null,
      lastPrefetch: null
    };
  }

  /**
   * Prefetch all necessary data from Supabase
   * Call this once when the module initializes
   * @returns {Promise<Object>} Prefetched data
   */
  async prefetchAllData() {
    try {
      console.log('[SupabaseClient] Prefetching all data from Supabase...');
      
      const startTime = Date.now();
      
      // Fetch all data in parallel
      const [
        fitnessPlans,
        wellnessPlans,
        fitnessProfile,
        wellnessProfile,
        userData,
        wardrobeItems
      ] = await Promise.all([
        this.getFitnessPlans(),
        this.getWellnessPlans(),
        this.getFitnessProfile(),
        this.getWellnessProfile(),
        this.getUserData(),
        this.getWardrobeItems()
      ]);
      
      // Store in cache
      this.cache = {
        fitnessPlans,
        wellnessPlans,
        fitnessProfile,
        wellnessProfile,
        userData,
        wardrobeItems,
        lastPrefetch: Date.now()
      };
      
      const duration = Date.now() - startTime;
      console.log(`[SupabaseClient] Prefetch completed in ${duration}ms`);
      console.log(`[SupabaseClient] - Fitness plans: ${fitnessPlans?.length || 0}`);
      console.log(`[SupabaseClient] - Wellness plans: ${wellnessPlans?.length || 0}`);
      console.log(`[SupabaseClient] - Wardrobe items: ${wardrobeItems?.length || 0}`);
      console.log(`[SupabaseClient] - User: ${userData?.name || 'N/A'}`);
      
      return this.cache;
    } catch (error) {
      console.error('[SupabaseClient] Error prefetching data:', error);
      throw error;
    }
  }

  /**
   * Get cached fitness plans (no fetch)
   * @returns {Array} Cached fitness plans
   */
  getCachedFitnessPlans() {
    return this.cache.fitnessPlans || [];
  }

  /**
   * Get cached wellness plans (no fetch)
   * @returns {Array} Cached wellness plans
   */
  getCachedWellnessPlans() {
    return this.cache.wellnessPlans || [];
  }

  /**
   * Get cached wardrobe items (no fetch)
   * @returns {Array} Cached wardrobe items
   */
  getCachedWardrobeItems() {
    return this.cache.wardrobeItems || [];
  }

  /**
   * Fetch fitness plans for the user
   * @returns {Promise<Array>} Array of fitness plans
   */
  async getFitnessPlans() {
    try {
      const url = `${this.baseUrl}/rest/v1/fitness_plans?user_id=eq.${this.userId}&select=*`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fitness plans: ${response.statusText}`);
      }

      const plans = await response.json();
      return plans;
    } catch (error) {
      console.error('Error fetching fitness plans:', error);
      throw error;
    }
  }

  /**
   * Fetch wellness plans for the user
   * @returns {Promise<Array>} Array of wellness plans
   */
  async getWellnessPlans() {
    try {
      const url = `${this.baseUrl}/rest/v1/wellness_plans?user_id=eq.${this.userId}&select=*`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wellness plans: ${response.statusText}`);
      }

      const plans = await response.json();
      return plans;
    } catch (error) {
      console.error('Error fetching wellness plans:', error);
      throw error;
    }
  }

  /**
   * Fetch user's fitness profile
   * @returns {Promise<Object>} User's fitness profile
   */
  async getFitnessProfile() {
    try {
      const url = `${this.baseUrl}/rest/v1/fitness_profiles?user_id=eq.${this.userId}&select=*&limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fitness profile: ${response.statusText}`);
      }

      const profiles = await response.json();
      return profiles.length > 0 ? profiles[0] : null;
    } catch (error) {
      console.error('Error fetching fitness profile:', error);
      throw error;
    }
  }

  /**
   * Fetch user's wellness profile
   * @returns {Promise<Object>} User's wellness profile
   */
  async getWellnessProfile() {
    try {
      const url = `${this.baseUrl}/rest/v1/wellness_profiles?user_id=eq.${this.userId}&select=*&limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wellness profile: ${response.statusText}`);
      }

      const profiles = await response.json();
      return profiles.length > 0 ? profiles[0] : null;
    } catch (error) {
      console.error('Error fetching wellness profile:', error);
      throw error;
    }
  }

  /**
   * Fetch user data
   * @returns {Promise<Object>} User data
   */
  async getUserData() {
    try {
      const url = `${this.baseUrl}/rest/v1/users?id=eq.${this.userId}&select=*&limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.statusText}`);
      }

      const users = await response.json();
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      console.error('Error fetching user data:', error);
      throw error;
    }
  }

  /**
   * Fetch wardrobe items for the user
   * @returns {Promise<Array>} Array of wardrobe items with tags
   */
  async getWardrobeItems() {
    try {
      console.log(`[SupabaseClient] Fetching wardrobe items for user: ${this.userId}`);
      const url = `${this.baseUrl}/rest/v1/wardrobe_items?user_id=eq.${this.userId}&select=*`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        console.error(`[SupabaseClient] Failed to fetch wardrobe items: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch wardrobe items: ${response.statusText}`);
      }

      const items = await response.json();
      console.log(`[SupabaseClient] Successfully fetched ${items.length} wardrobe items`);
      return items;
    } catch (error) {
      console.error('[SupabaseClient] Error fetching wardrobe items:', error);
      throw error;
    }
  }

  /**
   * Fetch fitness progress for a specific plan
   * @param {string} planId - The plan ID
   * @returns {Promise<Array>} Array of completed workouts
   */
  async getFitnessProgress(planId) {
    try {
      const url = `${this.baseUrl}/rest/v1/fitness_progress?plan_id=eq.${planId}&user_id=eq.${this.userId}&select=*&order=week_number.asc,day_number.asc`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fitness progress: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching fitness progress:', error);
      throw error;
    }
  }

  /**
   * Get completed days for a plan (grouped by week and day)
   * @param {string} planId - The plan ID
   * @returns {Promise<Array>} Array of completed day identifiers
   */
  async getCompletedDays(planId) {
    try {
      const progress = await this.getFitnessProgress(planId);
      
      // Group by week and day to find completed days
      const completedDays = new Set();
      
      for (const record of progress) {
        if (record.completed && record.week_number && record.day_number) {
          completedDays.add(`week${record.week_number}_day${record.day_number}`);
        }
      }
      
      return Array.from(completedDays);
    } catch (error) {
      console.error('Error getting completed days:', error);
      return [];
    }
  }

  /**
   * Fetch wellness progress for a specific plan
   * @param {string} planId - The plan ID
   * @returns {Promise<Array>} Array of completed wellness sessions
   */
  async getWellnessProgress(planId) {
    try {
      // Note: wellness_progress table doesn't have user_id column, only plan_id
      const url = `${this.baseUrl}/rest/v1/wellness_progress?plan_id=eq.${planId}&select=*&order=week_number.asc,day_number.asc`;
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch wellness progress: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching wellness progress:', error);
      throw error;
    }
  }

  /**
   * Get completed wellness days for a plan
   * @param {string} planId - The plan ID
   * @returns {Promise<Array>} Array of {week, day} objects
   */
  async getCompletedWellnessDays(planId) {
    try {
      const progress = await this.getWellnessProgress(planId);
      
      return progress
        .filter(record => record.completed && record.week_number && record.day_number)
        .map(record => ({
          week: record.week_number,
          day: record.day_number
        }));
    } catch (error) {
      console.error('Error getting completed wellness days:', error);
      return [];
    }
  }
}

module.exports = { SupabaseClient };

