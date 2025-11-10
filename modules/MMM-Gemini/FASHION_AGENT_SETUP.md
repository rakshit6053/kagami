# Fashion Agent Setup

## Overview

The fashion agent provides personalized outfit suggestions through voice commands based on the user's actual wardrobe stored in Supabase. The agent engages in natural conversation to understand the user's needs and suggests complete outfits from their existing wardrobe.

## How It Works

### Data Source

The fashion agent fetches wardrobe items from the `wardrobe_items` table in Supabase. Each item includes:

- **item_type**: Category of clothing (e.g., pants, jacket, shoes, jewelry)
- **color**: Color of the item
- **fabric**: Material (e.g., cotton, wool, leather)
- **season**: Appropriate season (e.g., summer, winter, all-season)
- **subcategory**: Specific style (e.g., sneakers, bomber jacket, cargo pants)
- **collection_category**: Main category (clothing, shoes, accessories)
- **analysis_data**: Additional metadata (style, formality, pattern, fit)

### Wardrobe Context in System Prompt

The fashion agent automatically builds a wardrobe inventory context that is injected into the AI's system prompt. This context includes:

- All wardrobe items grouped by category (item_type)
- Detailed tags for each item (color, fabric, season, subcategory)
- Analysis data when available (style, formality, pattern, fit)

Example wardrobe context structure:

```
PANTS:
  - pants (black, cotton blend, all-season season)
  - pants (white, cotton, all-season season, cargo pants)

SHOES:
  - shoes (white, leather, all-season season, sneakers)

JACKET:
  - jacket (black, nylon, all-season season, bomber jacket)
  - jacket (gray, nylon, all-season season, bomber jacket)

SWEATER:
  - sweater (beige, wool blend, fall season, crewneck)
```

## Voice Commands & Interaction Flow

### Starting a Fashion Conversation

Users can ask for outfit suggestions in various ways:

- "What should I wear today?"
- "Can you suggest an outfit?"
- "Help me pick clothes for today"
- "What outfit would work for [occasion]?"

### Conversational Flow

The AI will engage naturally by asking clarifying questions:

1. **Weather Context**

   - "Are you dressing for warm or cold weather?"
   - "What's the temperature like today?"

2. **Occasion**

   - "What's the occasion - work, casual, or something special?"
   - "Where are you headed today?"

3. **Style Preferences**

   - "What style are you going for today?"
   - "Do you want something professional or casual?"

4. **Color Preferences**
   - "Any color preferences?"
   - "What colors do you feel like wearing?"

### Outfit Suggestions

After gathering context, the AI suggests complete outfits:

**Example Response:**

> "For a casual day out in warm weather, I'd suggest:
>
> - Your white cotton cargo pants (breathable and comfortable)
> - Paired with your gray cotton blend hoodie for a relaxed look
> - And your white leather sneakers to keep it casual
>
> This combination is perfect for warm weather and gives you a clean, laid-back style."

## Key Features

### 1. Contextual Awareness

- Considers weather conditions
- Matches outfit to occasion (formal, casual, sport, etc.)
- Respects user style preferences
- Suggests appropriate seasonal items

### 2. Conversational Intelligence

The AI asks relevant follow-up questions to understand:

- Temperature preferences (warm/cold clothes)
- Event type (work, party, workout, casual)
- Formality level
- Color coordination

### 3. Wardrobe-Based Suggestions

- **Only suggests items the user actually owns**
- Never makes up or hallucinates clothing items
- References specific items from the wardrobe database
- Explains why certain combinations work well together

### 4. Complete Outfit Coordination

- Suggests top, bottom, shoes, and accessories
- Considers color coordination
- Matches fabrics appropriately
- Explains the reasoning behind suggestions

## Architecture

### Components

1. **FashionAgent** (`lib/fashion.js`)

   - Builds wardrobe context from cached data
   - Formats wardrobe items for the AI system prompt
   - Provides suggestion guidance

2. **WardrobeData Module** (`lib/wardrobeData.js`)

   - Manages wardrobe data fetching and caching
   - Provides utility functions for filtering items
   - Groups items by category, season, color, and occasion

3. **SupabaseClient** (`lib/supabaseClient.js`)

   - Fetches wardrobe items from Supabase on initialization
   - Caches wardrobe data for fast access
   - Prefetches all data at startup

4. **System Prompt Integration** (`node_helper.js`)
   - Injects wardrobe context into AI system prompt
   - Provides conversation guidelines for fashion suggestions
   - Ensures AI only uses items from actual wardrobe

## Data Flow

```
1. Module Start
   ↓
2. Supabase Prefetch (wardrobeItems included)
   ↓
3. Fashion Agent Initialized
   ↓
4. Wardrobe Context Built from Cache
   ↓
5. Context Injected into AI System Prompt
   ↓
6. User Asks for Outfit Suggestions
   ↓
7. AI Uses Wardrobe Context to Suggest Outfits
   ↓
8. Natural Conversation with Follow-up Questions
```

## Configuration

The fashion agent is automatically initialized when the module starts. No additional configuration is needed.

### User Data

The system uses the same user ID configured in `lib/supabaseConfig.js`:

- **User ID**: `6903aa9c-f7a8-4820-8d01-9a678f1c8832`

### Wardrobe Items

Wardrobe items are stored in the `wardrobe_items` table with RLS (Row Level Security) enabled, filtered by `user_id`.

## Important Rules

### The AI Will:

✅ Ask clarifying questions about weather, occasion, and preferences
✅ Suggest complete, coordinated outfits
✅ Explain why certain combinations work well
✅ Only use items from the user's actual wardrobe
✅ Consider season, weather, and formality

### The AI Will NOT:

❌ Suggest items the user doesn't own
❌ Make up or hallucinate clothing items
❌ Provide generic fashion advice without wardrobe context
❌ Ignore the wardrobe inventory

## Example Interactions

### Example 1: Morning Outfit

**User:** "What should I wear today?"

**AI:** "I'd be happy to help! First, what's the weather like today - are you dressing for warm or cold weather?"

**User:** "It's pretty warm outside"

**AI:** "Perfect! What's the occasion - is this for work, something casual, or a special event?"

**User:** "Just a casual day"

**AI:** "Great! For a casual warm day, I'd suggest:

- Your white cotton cargo pants (breathable and relaxed)
- With your gray cotton blend hoodie for a comfortable look
- And your white leather sneakers to complete the casual style

This gives you a clean, comfortable outfit perfect for a warm casual day."

### Example 2: Evening Out

**User:** "I need an outfit for going out tonight"

**AI:** "What kind of event are you going to - is it casual or more dressed up?"

**User:** "A bit dressy, but not too formal"

**AI:** "I'd recommend:

- Your black cotton blend pants for a sleek look
- Paired with your beige wool blend crewneck sweater for smart casual style
- Add your gold metal necklace for a touch of elegance
- And your white leather sneakers to keep it modern

This combination is dressy but not overly formal, perfect for an evening out!"

## Performance

### Caching

- Wardrobe items are prefetched once at module startup
- No database queries during outfit suggestions
- Fast response times since all data is in memory

### Data Refresh

- Wardrobe data is loaded when the module starts
- To refresh wardrobe data, restart the MagicMirror module

## Future Enhancements

Potential future features:

- Weather API integration for automatic weather context
- Outfit history tracking (what user wore recently)
- Seasonal outfit suggestions
- Color palette recommendations
- Style trend awareness
- Outfit rating and feedback
