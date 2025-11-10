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
 * Wardrobe Data Module
 * 
 * Manages fetching and caching of wardrobe items from Supabase
 */

let supabaseClient = null;

/**
 * Initialize the module with a SupabaseClient instance
 * @param {SupabaseClient} client - The Supabase client with prefetched data
 */
function initializeSupabaseClient(client) {
  supabaseClient = client;
  console.log('[WardrobeData] Supabase client initialized');
}

/**
 * Get wardrobe items from cache
 * @returns {Array} Cached wardrobe items
 */
function getCachedWardrobeItems() {
  if (!supabaseClient) {
    console.error('[WardrobeData] Supabase client not initialized');
    return [];
  }

  return supabaseClient.getCachedWardrobeItems();
}

/**
 * Get wardrobe items grouped by category
 * @returns {Object} Wardrobe items grouped by item_type
 */
function getGroupedWardrobeItems() {
  const items = getCachedWardrobeItems();
  const grouped = {};

  items.forEach(item => {
    const category = item.item_type || 'other';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(item);
  });

  return grouped;
}

/**
 * Filter wardrobe items by season
 * @param {string} season - Season to filter by (e.g., 'summer', 'winter')
 * @returns {Array} Filtered wardrobe items
 */
function getItemsBySeason(season) {
  const items = getCachedWardrobeItems();
  return items.filter(item => 
    item.season && item.season.toLowerCase().includes(season.toLowerCase())
  );
}

/**
 * Filter wardrobe items by color
 * @param {string} color - Color to filter by
 * @returns {Array} Filtered wardrobe items
 */
function getItemsByColor(color) {
  const items = getCachedWardrobeItems();
  return items.filter(item => 
    item.color && item.color.toLowerCase().includes(color.toLowerCase())
  );
}

/**
 * Get items suitable for a specific occasion
 * @param {string} occasion - Occasion type (e.g., 'formal', 'casual', 'sport')
 * @returns {Array} Filtered wardrobe items
 */
function getItemsByOccasion(occasion) {
  const items = getCachedWardrobeItems();
  const occasionLower = occasion.toLowerCase();
  
  return items.filter(item => {
    // Check analysis_data for formality or style
    if (item.analysis_data) {
      const data = item.analysis_data;
      if (data.formality && data.formality.toLowerCase().includes(occasionLower)) {
        return true;
      }
      if (data.style && data.style.toLowerCase().includes(occasionLower)) {
        return true;
      }
    }
    
    // Check subcategory
    if (item.subcategory && item.subcategory.toLowerCase().includes(occasionLower)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Get statistics about the wardrobe
 * @returns {Object} Wardrobe statistics
 */
function getWardrobeStats() {
  const items = getCachedWardrobeItems();
  const grouped = getGroupedWardrobeItems();
  
  const stats = {
    totalItems: items.length,
    categories: Object.keys(grouped).length,
    itemsByCategory: {}
  };
  
  for (const [category, categoryItems] of Object.entries(grouped)) {
    stats.itemsByCategory[category] = categoryItems.length;
  }
  
  return stats;
}

module.exports = {
  initializeSupabaseClient,
  getCachedWardrobeItems,
  getGroupedWardrobeItems,
  getItemsBySeason,
  getItemsByColor,
  getItemsByOccasion,
  getWardrobeStats
};

