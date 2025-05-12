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
    activationKey: "t", // Key to press to activate/deactivate listening

    initializingIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="white"><animate attributeName="r" dur="1.2s" values="35;40;35" repeatCount="indefinite" /></circle></svg>`,
    recordingIndicatorSvg: `<svg width="50" height="50" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"><animate attributeName="r" dur="1.2s" values="35;40;35" repeatCount="indefinite" /></circle></svg>`,
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
  isActivating: false,

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

    this.sendSocketNotification("START_CONNECTION", {
      apiKey: this.config.apiKey,
    });

    // Add key press listener
    document.addEventListener("keydown", this.handleKeyPress.bind(this));

    this.updateDom();
  },

  handleKeyPress: function(event) {
    // Ignore key presses if a modifier key like Ctrl, Alt, Meta is also pressed,
    // or if the user might be typing in an input field (though less common in MM core)
    if (event.ctrlKey || event.altKey || event.metaKey || event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }

    if (event.key.toLowerCase() === this.config.activationKey.toLowerCase()) {
        Log.info(this.name + " activation key '" + this.config.activationKey + "' pressed.");
        if (!this.isListening && !this.isActivating) {
            Log.info(this.name + ": Activating listening.");
            this.sendSocketNotification("ACTIVATE_LISTENING");
            this.isActivating = true; // Set flag to prevent multiple rapid activations
            // UI will be updated by socketNotificationReceived for GEMINI_CONNECTING
        } else if (this.isListening) {
            Log.info(this.name + ": Deactivating listening.");
            this.sendSocketNotification("DEACTIVATE_LISTENING");
            // UI will be updated by socketNotificationReceived for GEMINI_DISCONNECTED or RECORDING_STOPPED
        } else if (this.isActivating) {
            Log.warn(this.name + ": Activation already in progress. Key press ignored.");
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
        this.currentStatusText = "Ready (Press '" + this.config.activationKey + "')";
        this.currentState = "READY_TO_LISTEN";
        this.isListening = false;
        this.isActivating = false;
        break;
      case "GEMINI_CONNECTING":
        this.currentStatusText = "Connecting to Gemini...";
        this.currentState = "CONNECTING";
        this.isActivating = true; // Still in the process of activating
        this.isListening = false;
        break;
      case "GEMINI_CONNECTED":
        this.currentStatusText = "Connected. Starting microphone...";
        // isActivating remains true until RECORDING_STARTED
        this.currentState = "ACTIVATING"; // Or perhaps CONNECTED_WAITING_FOR_MIC
        break;
      case "RECORDING_STARTED":
        this.currentStatusText = "Listening...";
        this.currentState = "RECORDING";
        this.isListening = true;
        this.isActivating = false; // Activation complete, now listening
        break;
      case "GEMINI_TEXT_RESPONSE":
        if (payload.text) {
          this.lastResponseText += payload.text; 
        }
        break;
      case "GEMINI_TURN_COMPLETE":
        this.currentStatusText = "Gemini finished. Press '" + this.config.activationKey + "' to talk.";
        // this.currentState = "READY_TO_LISTEN"; // Or some other idle state
        // No automatic deactivation, user presses key again to start new or stop.
        // If user wants to immediately talk again, they press 't'. If they want to stop, also 't'.
        // If isListening is true, next 't' will deactivate.
        break;
      case "GEMINI_DISCONNECTED":
        this.currentStatusText = "Disconnected. Press '" + this.config.activationKey + "' to talk.";
        this.currentState = "READY_TO_LISTEN";
        this.isListening = false;
        this.isActivating = false;
        break;
      case "RECORDING_STOPPED":
        // This usually follows DEACTIVATE_LISTENING or an error.
        // If not already handled by GEMINI_DISCONNECTED, update status.
        if (!this.isActivating && !this.isListening) { // Only update if not in another transition
             this.currentStatusText = "Recording stopped. Press '" + this.config.activationKey + "' to talk.";
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
        this.currentStatusText = "Image generated! Press '" + this.config.activationKey + "' to talk.";
        // this.currentState = "READY_TO_LISTEN";
        Log.info(this.name + " Image Data Received");
        break;
      case "GEMINI_IMAGE_BLOCKED":
        this.isGeneratingImage = false;
        this.currentStatusText = `Image generation blocked: ${payload.reason}. Press '${this.config.activationKey}' to talk.`;
        // this.currentState = "READY_TO_LISTEN";
        Log.warn(this.name + " Image generation blocked: " + payload.reason);
        break;
      default:
          Log.warn(`${this.name} received unhandled notification: ${notification}`);
          break;
    }

    // Update currentStatusText based on overall state if not specifically set above
    if (this.isGeneratingImage && this.currentState !== "ERROR") {
        this.currentStatusText = "Generating image...";
    } else if (this.isListening) {
        this.currentStatusText = "Listening...";
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