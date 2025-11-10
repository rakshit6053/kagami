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

/**
 * Fashion Agent
 * 
 * Provides outfit suggestions based on:
 * - User's wardrobe items from Supabase
 * - Weather conditions
 * - Occasion/context
 * - User preferences
 */

let supabaseClient = null;

/**
 * Initialize the fashion agent with a SupabaseClient instance
 * @param {SupabaseClient} client - The Supabase client with prefetched data
 */
function initializeSupabaseClient(client) {
  supabaseClient = client;
  console.log('[FashionAgent] Supabase client initialized');
}

class FashionAgent {
  constructor({ notifyFront, speak, log, warn, error }) {
    this.notifyFront = notifyFront; // fn(notification, payload) => frontend relays to other modules
    this.speak = speak; // fn(text) => AI speech synthesis
    this.log = log;
    this.warn = warn;
    this.error = error;
    this.wardrobeCache = null;
    this.lastCacheTime = null;
  }

  /**
   * Build a formatted wardrobe context string for the AI system prompt
   * @param {Array} wardrobeItems - Array of wardrobe items from Supabase
   * @returns {string} Formatted wardrobe description
   */
  buildWardrobeContext(wardrobeItems) {
    if (!wardrobeItems || wardrobeItems.length === 0) {
      return "No wardrobe items found.";
    }

    // Group items by category for better organization
    const grouped = {};
    
    wardrobeItems.forEach(item => {
      const category = item.item_type || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      
      // Build a description for this item
      const tags = [];
      
      // Add analysis data first if available (more detailed)
      if (item.analysis_data) {
        const data = item.analysis_data;
        
        // Primary attributes
        if (data.subcategory) tags.push(data.subcategory);
        if (data.color) tags.push(data.color);
        if (data.material) tags.push(data.material);
        
        // Style and occasion
        if (data.style) tags.push(`style: ${data.style}`);
        if (data.occasion) tags.push(`occasion: ${data.occasion}`);
        if (data.season) tags.push(`${data.season}`);
        if (data.pattern) tags.push(`pattern: ${data.pattern}`);
        
        // Additional tags
        if (data.tags && Array.isArray(data.tags) && data.tags.length > 0) {
          tags.push(`tags: [${data.tags.slice(0, 3).join(', ')}]`);
        }
      } else {
        // Fallback to basic fields if no analysis data
        if (item.subcategory) tags.push(item.subcategory);
        if (item.color) tags.push(item.color);
        if (item.fabric) tags.push(item.fabric);
        if (item.season) tags.push(`${item.season}`);
      }
      
      const description = tags.length > 0 ? `(${tags.join(', ')})` : '';
      grouped[category].push(`  - ${item.item_type} ${description}`);
    });

    // Build the wardrobe context string
    let context = "USER'S WARDROBE INVENTORY:\n\n";
    
    for (const [category, items] of Object.entries(grouped)) {
      context += `${category.toUpperCase()}:\n`;
      context += items.join('\n');
      context += '\n\n';
    }
    
    return context;
  }

  /**
   * Get wardrobe context from cached data
   * @param {Array} wardrobeItems - Wardrobe items from Supabase cache
   * @returns {string} Wardrobe context for system prompt
   */
  getWardrobeContextFromCache(wardrobeItems) {
    try {
      if (!wardrobeItems || wardrobeItems.length === 0) {
        this.warn("No wardrobe items provided to fashion agent");
        return "No wardrobe items found. Please add items to your wardrobe in the database.";
      }
      
      this.log(`Building wardrobe context with ${wardrobeItems.length} items`);
      this.wardrobeCache = this.buildWardrobeContext(wardrobeItems);
      this.lastCacheTime = Date.now();
      return this.wardrobeCache;
    } catch (error) {
      this.error("Error building wardrobe context:", error);
      return "Unable to load wardrobe data.";
    }
  }

  /**
   * Generate outfit suggestions based on criteria
   * This is called by the AI agent when user asks for outfit help
   * @param {Object} criteria - { weather, occasion, preferences }
   * @returns {string} Suggestions or guidance for the AI
   */
  getSuggestionGuidance(criteria = {}) {
    const { weather, occasion, preferences } = criteria;
    
    let guidance = "When suggesting outfits:\n";
    
    if (weather) {
      guidance += `- Consider the weather: ${weather}\n`;
    }
    
    if (occasion) {
      guidance += `- Appropriate for: ${occasion}\n`;
    }
    
    if (preferences) {
      guidance += `- User preferences: ${preferences}\n`;
    }
    
    guidance += "- Only suggest items from the user's actual wardrobe (listed above)\n";
    guidance += "- Combine items thoughtfully for a cohesive look\n";
    guidance += "- Explain why the combination works\n";
    
    return guidance;
  }

  /**
   * Clear cached wardrobe data
   */
  clearCache() {
    this.wardrobeCache = null;
    this.lastCacheTime = null;
    this.log("Fashion agent cache cleared");
  }
}

module.exports = { FashionAgent, initializeSupabaseClient };

