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
Module.register("MMM-Gemini", {
  defaults: {
    statusText: "Initializing...",
    apiKey: "", // MUST be set in config.js

    showIndicators: true,
    activationKey: " ", // Key to press to activate/deactivate listening (spacebar)

    initializingIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="white"><animate attributeName="r" dur="1.2s" values="35;40;35" repeatCount="indefinite" /></circle></svg>`,
    recordingIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"><animate attributeName="r" dur="1.2s" values="35;40;35" repeatCount="indefinite" /></circle></svg>`,
    mutedIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="orange" /></svg>`,
    errorIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#333" /><line x1="30" y1="30" x2="70" y2="70" stroke="red" stroke-width="10" /><line x1="70" y1="30" x2="30" y2="70" stroke="red" stroke-width="10" /></svg>`,
  },

  currentState: "INITIALIZING",
  currentStatusText: "",
  lastResponseText: "",
  lastImageData: null,
  isGeneratingImage: false,
  helperReady: false,
  turnComplete: true,
  isListening: false,
  isMuted: false,
  isActivating: false,
  keyIsDown: false,

  // --- Lifecycle Functions ---
  start() {
    Log.info(this.name + " is starting!");
    this.config = Object.assign({}, this.defaults, this.config);
    this.currentStatusText = this.config.statusText;
    this.currentState = "INITIALIZING";
    this.helperReady = false;
    this.lastResponseText = "";
    this.lastImageData = null;
    this.isGeneratingImage = false;
    this.isListening = false;
    this.isActivating = false;

    if (!this.config.apiKey) {
      Log.error(`${this.name}: apiKey not set in config! Module disabled.`);
      this.currentStatusText = "Error: API Key missing in config.js.";
      this.currentState = "ERROR";
      this.updateDom();
      return;
    }

    // Get weather module config from global config
    const weatherModules = MM.getModules().filter(module => module.name === "weather");
    let locationInfo = null;
    
    if (weatherModules.length > 0) {
        // Try to find the 'current' weather module first
        let weatherModule = weatherModules.find(m => m.config.type === "current");
        // If not found, take the first available weather module
        if (!weatherModule && weatherModules.length > 0) {
            weatherModule = weatherModules[0]; 
        }

        if (weatherModule && weatherModule.config && typeof weatherModule.config.lat !== 'undefined' && typeof weatherModule.config.lon !== 'undefined') {
            locationInfo = {
                lat: weatherModule.config.lat,
                lon: weatherModule.config.lon
            };
            Log.info(this.name + ": Found location from weather module:", locationInfo);
        } else {
            Log.warn(this.name + ": Could not find lat/lon in a weather module's config. Location-specific features may be impaired.");
        }
    } else {
        Log.warn(this.name + ": No weather module found. Location-specific features may be impaired.");
    }
    
    // Send API key and location (if found) to node helper for initialization
    this.sendSocketNotification("INIT", { 
        apiKey: this.config.apiKey,
        location: locationInfo // This can be null if not found
    });

    // Add key event listeners for press-to-talk functionality
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));

    this.updateDom();
  },

  handleKeyDown: function(event) {
    // Ignore key presses if a modifier key like Ctrl, Alt, Meta is also pressed,
    // or if the user might be typing in an input field (though less common in MM core)
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    if (event.key.toLowerCase() === this.config.activationKey.toLowerCase()) {
        // Prevent repeating the keydown event when key is held
        if (this.keyIsDown) return;
        this.keyIsDown = true;
        
        Log.info(this.name + " activation key '" + this.config.activationKey + "' pressed.");

        // If we're already recording but muted, just unmute
        if (this.isMuted) {
            Log.info(this.name + ": Unmuting microphone");
            this.sendSocketNotification("ACTIVATE_LISTENING"); // This will handle unmuting
            return;
        }
        
        // Otherwise start a new recording session if not already listening
        if (!this.isListening && !this.isActivating && this.helperReady) {
            Log.info(this.name + ": Activating listening.");
            this.sendSocketNotification("ACTIVATE_LISTENING");
            this.isActivating = true;
        }
    }
  },

  handleKeyUp: function(event) {
    if (event.key.toLowerCase() === this.config.activationKey.toLowerCase()) {
        this.keyIsDown = false;
        
        if (this.isListening && !this.isMuted) {
            Log.info(this.name + ": Muting microphone (key released).");
            this.sendSocketNotification("MUTE_MICROPHONE");
            // UI will be updated by socketNotificationReceived for MICROPHONE_MUTED
        }
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-gemini";

    // Button removed as per user request, activation is via key press
    
    // --- Create Indicator ---
    let indicatorSvg = "";
    if (this.config.showIndicators) {
      switch (this.currentState) {
        case "INITIALIZING":
        // Use a more generic "ready" or "idle" indicator once initialized
          indicatorSvg = this.config.initializingIndicatorSvg;
          break;
        case "READY_TO_LISTEN": // New state for when API is ready, waiting for key press
            indicatorSvg = `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#4CAF50" /></svg>`; // Green circle for ready
            break;
        case "CONNECTING":
        case "ACTIVATING": // Covers the phase from key press to actually recording
            indicatorSvg = this.config.initializingIndicatorSvg; // Pulsing white can mean connecting/activating
            break;
        case "RECORDING":
          indicatorSvg = this.config.recordingIndicatorSvg;
          break;
        case "MUTED":
          indicatorSvg = this.config.mutedIndicatorSvg;
          break;
        case "ERROR":
          indicatorSvg = this.config.errorIndicatorSvg;
          break;
        case "SHUTDOWN": // May not be used if we don't explicitly shut down
          indicatorSvg = "";
          break;
        default:
          indicatorSvg = this.config.errorIndicatorSvg;
          break;
      }
    }
    const statusIndicatorDiv = document.createElement("div");
    statusIndicatorDiv.className = "status-indicator";
    statusIndicatorDiv.innerHTML = indicatorSvg;
    wrapper.appendChild(statusIndicatorDiv);

    // --- Create Main Content Area (Image/Loader + Text) ---
    const contentDiv = document.createElement("div");
    contentDiv.className = "content-container";

    // --- Image / Loader Element ---
    const imageContainer = document.createElement("div");
    imageContainer.className = "image-container";

    if (this.isGeneratingImage) {
      const loader = document.createElement("div");
      loader.className = "image-loader"; 
      imageContainer.appendChild(loader);
      imageContainer.style.display = 'block';
    } else if (this.lastImageData) {
      const imageElement = document.createElement("img");
      imageElement.className = "generated-image";
      imageElement.src = `data:image/png;base64,${this.lastImageData}`;
      imageElement.style.display = "block";
      imageElement.style.maxWidth = "90%";
      imageElement.style.maxHeight = "300px";
      imageElement.style.margin = "0 auto 10px auto";
      imageContainer.appendChild(imageElement);
      imageContainer.style.display = 'block';
    } else {
      imageContainer.style.display = 'none';
    }
    contentDiv.appendChild(imageContainer);

    // --- Text Elements ---
    const textDiv = document.createElement("div");
    textDiv.className = "text-container";

    const statusTextDiv = document.createElement("div");
    statusTextDiv.id = "gemini-status-text"; // Using this instead of the old statusDisplay
    statusTextDiv.className = "current-status";
    statusTextDiv.innerHTML = this.currentStatusText || "&nbsp;";
    textDiv.appendChild(statusTextDiv);

    const responseTextDiv = document.createElement("div");
    responseTextDiv.id = "gemini-text-response"; // Consistent ID
    responseTextDiv.className = "response";
    if (this.lastResponseText) { // Display if there is any text
       responseTextDiv.innerHTML = `${this.lastResponseText}`;
       responseTextDiv.style.display = 'block';
    } else {
       responseTextDiv.innerHTML = "&nbsp;";
       responseTextDiv.style.display = 'none';
    }
    
    textDiv.appendChild(responseTextDiv);

    contentDiv.appendChild(textDiv);
    wrapper.appendChild(contentDiv);

    return wrapper;
  },


  getStyles: function() {
      return ["MMM-Gemini.css"];
  },

  socketNotificationReceived: function (notification, payload) {
    Log.info(this.name + " received a socket notification: " + notification + " - Payload: ", payload);
    
    // No talkButton to update, rely on internal state and status text updates
    const statusTextDiv = document.getElementById("gemini-status-text");
    const responseTextDiv = document.getElementById("gemini-text-response");

    // Clear previous response text when starting a new interaction cycle
    if ([ "GEMINI_CONNECTING", "RECORDING_STARTED"].includes(notification)) {
        this.lastResponseText = "";
        if(responseTextDiv) responseTextDiv.innerHTML = "";
    }

    switch (notification) {
      case "HELPER_READY_FOR_ACTIVATION":
        this.currentStatusText = "Ready (Hold spacebar to talk)";
        this.currentState = "READY_TO_LISTEN";
        this.isListening = false;
        this.isMuted = false;
        this.isActivating = false;
        this.helperReady = true;
        break;
      case "GEMINI_CONNECTING":
        this.currentStatusText = "Connecting to Gemini...";
        this.currentState = "CONNECTING";
        this.isActivating = true; // Still in the process of activating
        this.isListening = false;
        this.isMuted = false;
        break;
      case "GEMINI_CONNECTED":
        this.currentStatusText = "Connected. Starting microphone...";
        // isActivating remains true until RECORDING_STARTED
        this.currentState = "ACTIVATING"; // Or perhaps CONNECTED_WAITING_FOR_MIC
        break;
      case "RECORDING_STARTED":
        this.currentStatusText = "Listening (release key to mute)...";
        this.currentState = "RECORDING";
        this.isListening = true;
        this.isMuted = false;
        this.isActivating = false; // Activation complete, now listening
        break;
      case "MICROPHONE_MUTED":
        this.currentStatusText = "Muted (hold key to talk)";
        this.currentState = "MUTED";
        this.isMuted = true;
        // Note: isListening remains true since the recording is still active
        break;
      case "GEMINI_TEXT_RESPONSE":
        if (payload.text) {
          this.lastResponseText += payload.text; 
        }
        break;
      case "GEMINI_TURN_COMPLETE":
        // Always ensure we're not in activating state after a turn completes
        this.isActivating = false;
        
        if (this.isMuted) {
          this.currentStatusText = "Ready (Hold spacebar to talk)";
        }
        break;
      case "GEMINI_DISCONNECTED":
        this.currentStatusText = "Disconnected. Hold spacebar to talk.";
        this.currentState = "READY_TO_LISTEN";
        this.isListening = false;
        this.isMuted = false;
        this.isActivating = false;
        break;
      case "RECORDING_STOPPED":
        // This is now only used when recording is completely stopped, not just muted
        this.isListening = false;
        this.isMuted = false;
        this.isActivating = false; // Make sure we can start listening again immediately
        
        // When we stop recording, update UI to show we're ready (unless we're in another state)
        if (!this.isActivating) {
          this.currentStatusText = "Ready (Hold spacebar to talk)";
          this.currentState = "READY_TO_LISTEN";
        }
        break;
      case "HELPER_ERROR":
        this.currentStatusText = `Error: ${payload.error}`;
        Log.error(this.name + " received HELPER_ERROR: ", payload.error);
        this.currentState = "ERROR";
        this.isListening = false;
        this.isActivating = false;
        break;
      case "GEMINI_IMAGE_GENERATING":
        this.isGeneratingImage = true;
        this.currentStatusText = "Generating image..."; 
        // this.currentState = "GENERATING_IMAGE"; // You might want a specific state
        break;
      case "GEMINI_IMAGE_GENERATED":
        this.isGeneratingImage = false;
        this.lastImageData = payload.image;
        this.currentStatusText = "Image generated! Hold spacebar to talk.";
        // this.currentState = "READY_TO_LISTEN";
        Log.info(this.name + " Image Data Received");
        break;
      case "GEMINI_IMAGE_BLOCKED":
        this.isGeneratingImage = false;
        this.currentStatusText = `Image generation blocked: ${payload.reason}. Hold spacebar to talk.`;
        // this.currentState = "READY_TO_LISTEN";
        Log.warn(this.name + " Image generation blocked: " + payload.reason);
        break;
      case "MEDITATION_STEP":
        // Stop any existing timer first
        this.sendNotification("INTERRUPT_STOPWATCHTIMER");
        
        // Hide any existing alert first
        this.sendNotification("HIDE_ALERT");
        
        // Short delay to ensure timer is stopped and alert is hidden, then start new one
        setTimeout(() => {
          // Show meditation instruction as alert
          this.sendNotification("SHOW_ALERT", {
            title: `Meditation (Step ${payload.stepNumber}/${payload.totalSteps})`,
            message: payload.instruction,
            timer: payload.seconds * 1000 // Show for full duration
          });
          
          // Start the visual countdown timer using MMM-StopwatchTimer
          this.sendNotification("START_TIMER", payload.seconds);
        }, 300);
        
        this.currentStatusText = `Meditation: Step ${payload.stepNumber}/${payload.totalSteps}`;
        Log.info(this.name + " Started meditation step: " + payload.instruction);
        break;
      case "MEDITATION_STEP_DONE":
        Log.info(this.name + " Meditation step " + (payload.idx + 1) + " completed");
        break;
      case "MEDITATION_COMPLETED":
        this.sendNotification("SHOW_ALERT", { 
          title: "Meditation Complete", 
          message: "Well done! Your meditation session is finished.", 
          timer: 5000 
        });
        this.sendNotification("INTERRUPT_STOPWATCHTIMER");
        this.currentStatusText = "Meditation completed. Hold spacebar to talk.";
        Log.info(this.name + " Meditation session completed");
        break;
      case "MEDITATION_ENDED":
        this.sendNotification("INTERRUPT_STOPWATCHTIMER");
        this.currentStatusText = "Meditation stopped. Hold spacebar to talk.";
        Log.info(this.name + " Meditation session ended");
        break;
      default:
          Log.warn(`${this.name} received unhandled notification: ${notification}`);
          break;
    }

    // Update currentStatusText based on overall state if not specifically set above
    if (this.isGeneratingImage && this.currentState !== "ERROR") {
        this.currentStatusText = "Generating image...";
    } else if (this.isListening && !this.isMuted) {
        this.currentStatusText = "Listening (release key to mute)...";
    } else if (this.isListening && this.isMuted) {
        this.currentStatusText = "Muted (hold key to talk)";
    } else if (this.isActivating) {
        this.currentStatusText = "Activating...";
    }
    
    // Final catch-all status update based on state for the indicator
    if (statusTextDiv) statusTextDiv.innerHTML = this.currentStatusText;
    if (responseTextDiv && this.lastResponseText) responseTextDiv.innerHTML = this.lastResponseText;
    else if (responseTextDiv) responseTextDiv.innerHTML = "&nbsp;";

    this.updateDom();
  },
});