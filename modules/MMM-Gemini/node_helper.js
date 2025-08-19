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
const NodeHelper = require("node_helper")
const { GoogleGenAI, Modality, DynamicRetrievalConfigMode, Type, PersonGeneration } = require("@google/genai")
const recorder = require('node-record-lpcm16')
const { Buffer } = require('buffer')
const Speaker = require('speaker-arm64')

const INPUT_SAMPLE_RATE = 44100  // Standard CD quality
const OUTPUT_SAMPLE_RATE = 24000 // Gemini outputs at 24kHz
const CHANNELS = 1
const AUDIO_TYPE = 'raw' // Gemini Live API uses raw data streams
const ENCODING = 'signed-integer'
const BITS = 16
const GEMINI_INPUT_MIME_TYPE = `audio/pcm;rate=${INPUT_SAMPLE_RATE}`
const GEMINI_SESSION_HANDLE = "magic_mirror"


const GEMINI_MODEL = 'gemini-2.0-flash-live-001'
// const API_VERSION = 'v1alpha'

process.env.DEBUG = 'record';

module.exports = NodeHelper.create({
    genAI: null,
    liveSession: null,
    apiKey: null,
    recordingProcess: null,
    isRecording: false,
    isMuted: false,
    audioQueue: [],
    persistentSpeaker: null,
    processingQueue: false,
    apiInitialized: false,
    connectionOpen: false,
    apiInitializing: false,
    geminiConnecting: false,
    imaGenAI: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 5000,
    isPermanentlyDisconnected: false,
    liveSessionReady: false,
    userLocation: null,

    // Logger functions
    log: function(...args) { console.log(`[${new Date().toISOString()}] LOG (${this.name}):`, ...args) },
    error: function(...args) { console.error(`[${new Date().toISOString()}] ERROR (${this.name}):`, ...args) },
    warn: function(...args) { console.warn(`[${new Date().toISOString()}] WARN (${this.name}):`, ...args) },
    sendToFrontend: function(notification, payload) { this.sendSocketNotification(notification, payload) },

    applyDefaultState(preserveApiKey = false) {
        if (!preserveApiKey) this.apiKey = null;
        this.genAI = null
        this.liveSession = null
        this.recordingProcess = null
        this.isRecording = false
        this.isMuted = false
        this.audioQueue = []
        this.persistentSpeaker = null
        this.processingQueue = false
        this.apiInitialized = false
        this.connectionOpen = false
        this.apiInitializing = false
        this.geminiConnecting = false;
        this.closePersistentSpeaker()
        this.imaGenAI = null
        // Reconnect attempts for Live API are managed by establishLiveConnectionAndRecord
    },

    // Initializes GoogleGenAI instances but does not connect to Live API
    async initializeApiInstances(apiKey) {
        this.log(">>> initializeApiInstances called")

        if (this.apiInitialized || this.apiInitializing) {
            this.warn(`API instances already initialized or in progress. Initialized: ${this.apiInitialized}, Initializing: ${this.apiInitializing}`)
            if (this.apiInitialized) {
                this.sendToFrontend("HELPER_READY_FOR_ACTIVATION") // Inform frontend instances are ready
            }
            return
        }
        if (!apiKey) {
            this.error('API Key is missing! Cannot initialize API instances')
            this.sendToFrontend("HELPER_ERROR", { error: "API Key missing on server for instance initialization" })
            return
        }

        this.apiKey = apiKey
        this.apiInitializing = true
        this.log('Initializing GoogleGenAI instances...')

        try {
            this.sendToFrontend("INITIALIZING_API_INSTANCES")
            this.log("Step 1: Creating GoogleGenAI instances...")

            this.genAI = new GoogleGenAI({
                apiKey: this.apiKey,
            })

            this.imaGenAI = new GoogleGenAI({
                apiKey: this.apiKey,
            })

            this.log('Step 2: GoogleGenAI instances created.')
            this.apiInitialized = true
            this.apiInitializing = false
            this.sendToFrontend("HELPER_READY_FOR_ACTIVATION") // Inform frontend instances are ready

        } catch (error) {
            this.error('API Instance Initialization failed:', error)
            this.applyDefaultState() // Full reset
            this.sendToFrontend("HELPER_ERROR", { error: `API Instance Initialization failed: ${error.message || error}` })
        }
    },

    async establishLiveConnectionAndRecord() {
        this.liveSessionReady = false;
        this.log(">>> establishLiveConnectionAndRecord called")
        if (!this.apiInitialized) {
            this.error("Cannot establish connection: API instances not initialized. Call initializeApiInstances first with API Key.");
            this.sendToFrontend("HELPER_ERROR", { error: "API not initialized. Provide API Key." });
            return;
        }
        if (this.connectionOpen || this.geminiConnecting) {
            this.warn(`Connection already open or in progress. Open: ${this.connectionOpen}, Connecting: ${this.geminiConnecting}`);
            if (this.connectionOpen && !this.isRecording) { // Connection is open, but not recording, try to start recording
                this.log("Connection is open, attempting to start recording.");
                this.startRecording()
            }
            return;
        }
        if (this.isPermanentlyDisconnected) {
            this.error("Cannot establish connection: Permanently disconnected after multiple failures.");
            this.sendToFrontend("HELPER_ERROR", { error: "Connection permanently failed. Restart module or check logs." });
            return;
        }

        this.geminiConnecting = true;
        this.sendToFrontend("GEMINI_CONNECTING");
        this.log(`Step 3: Attempting to establish Live Connection with ${GEMINI_MODEL}... (Attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)

        try {
            this.liveSession = await this.genAI.live.connect({
                model: GEMINI_MODEL,
                callbacks: {
                    onopen: () => {
                        this.log(">>> Live Connection Callback: onopen triggered!")
                        this.connectionOpen = true
                        this.geminiConnecting = false;
                        this.reconnectAttempts = 0;
                        this.isPermanentlyDisconnected = false; 
                        
                        if (this.liveSessionReady) {
                            this.log("Connection OPENED and session ready. Starting recording.")
                        this.sendToFrontend("GEMINI_CONNECTED")
                            this.startRecording()
                        } else {
                            this.log("Connection OPENED but waiting for session to be ready...")
                        }
                    },
                    onmessage: (message) => { this.handleGeminiResponse(message) },
                    onerror: (e) => {
                        this.error(`Live Connection ERROR: ${e?.message || e}`)
                        this.connectionOpen = false
                        this.geminiConnecting = false;
                        this.stopRecording(true)
                        this.closePersistentSpeaker()
                        this.processingQueue = false
                        this.audioQueue = []
                        this.sendToFrontend("HELPER_ERROR", { error: `Live Connection Error: ${e?.message || e}` })
                        this.isPermanentlyDisconnected = true; // Assume fatal error for onerror
                        this.liveSession = null; 
                    },
                    onclose: async (e) => {
                        this.warn(`Live Connection CLOSED. Details: ${JSON.stringify(e, null, 2)}`)
                        const wasOpen = this.connectionOpen;
                        const wasConnecting = this.geminiConnecting;

                        this.connectionOpen = false;
                        this.geminiConnecting = false;
                        this.stopRecording(true);
                        this.closePersistentSpeaker();
                        this.audioQueue = [];
                        if (this.liveSession) { this.liveSession = null; }

                        this.sendToFrontend("GEMINI_DISCONNECTED");

                        if (this.isPermanentlyDisconnected) {
                            this.log("Connection is flagged as permanently closed. Not attempting to reconnect via onclose.");
                            return;
                        }
                        
                        // Only attempt reconnect if it was open or was actively trying to connect
                        if (wasOpen || wasConnecting) { 
                            this.reconnectAttempts++;
                            if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                                this.warn(`Live Connection attempt/session failed. Attempting reconnect #${this.reconnectAttempts} of ${this.maxReconnectAttempts} in ${this.reconnectDelay / 1000}s...`);
                                this.sendToFrontend("HELPER_ERROR", { error: `Live Connection failed. Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}...` });
                                setTimeout(async () => {
                                    if (!this.isPermanentlyDisconnected) { 
                                        await this.establishLiveConnectionAndRecord();
                                    } else {
                                        this.log("Reconnection attempt aborted as connection is now permanently closed.");
                                    }
                                }, this.reconnectDelay);
                            } else {
                                this.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached for Live API. Giving up.`);
                                this.sendToFrontend("HELPER_ERROR", { error: `Live Connection failed after ${this.maxReconnectAttempts} attempts.` });
                                this.isPermanentlyDisconnected = true;
                            }
                        } else { 
                            this.log("Live Connection closed (was not previously open or trying to connect). Not auto-reconnecting from onclose.");
                        }
                    },
                },
                
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: "Puck",
                            },
                        },
                    },
                    systemInstruction: {
                        parts: [ { text: `You are Kagami — a calm, intelligent voice assistant embedded in a smart mirror.

Purpose:
You assist users with brief, natural responses to everyday questions. People may speak to you casually while getting ready or walking by — so your answers must be clear, concise, and voice-optimized.

Smart Mirror Context:
You're not a chatbot or phone assistant. Your tone is always calm, helpful, and subtly warm. 

${this.userLocation ? `The user's primary location is latitude ${this.userLocation.lat} and longitude ${this.userLocation.lon}. STRICT INSTRUCTION: When the user asks specifically for "weather" or "weather forecast" and does NOT name a different city/location in their voice query, you MUST use this primary location (latitude ${this.userLocation.lat}, longitude ${this.userLocation.lon}) to get the weather information. All weather information, regardless of location, MUST be provided in Celsius. Do not default to any other location or unit for such weather requests. For other local information requests, use this primary location unless the user explicitly specifies another location.` : "The user has not specified a primary location. If asked for weather or local information, you must ask for clarification (e.g., 'For what location?'). If providing weather after clarification, it MUST be in Celsius."}

What You Can Do:
Respond to general-purpose queries, including:
- Current time and date
- Local or global weather updates (If the user asks for "weather" or "weather forecast" without specifying a location in their query, use their primary location if available and provide the temperature in Celsius. Otherwise, ask for clarification; if weather is then given, it MUST be in Celsius.)
- Quick facts, definitions, or calculations
- Calendar-related info (e.g., "What day is it?")
- Motivational quotes, jokes, or fun facts
- Casual small talk or greetings

Light Entertainment:
You're also allowed to keep things fun with short, spoken games or entertainment such as:
- Movie or music trivia
- Quick riddles
- "Did you know?" facts
- This Day in History
- Two-line guessing games (e.g., "Guess the movie: A ship hits an iceberg…")

Tone:
- Friendly, brief, and conversational
- Never robotic or overly formal
- A touch of charm or wit is good maybe some sarcasm!
- Avoid sounding like a search engine or AI model

Final Note:
Kagami should feel like a calm, intelligent presence — always helpful, never intrusive. Think smart, speak simply, stay present.

Your default language is English, but you should respond in the input audio language from the speaker if you detect a non-English language. You must respond unmistakably in the language that the speaker inputs via audio.

` }],
                    },
                    tools: [{
                        googleSearch: {},
                        googleSearchRetrieval: {
                            dynamicRetrievalConfig: {
                                mode: DynamicRetrievalConfigMode.MODE_DYNAMIC,
                            }
                        },
                    }]
                },
            });
            
            this.liveSessionReady = true;
            
            if (this.connectionOpen && !this.isRecording) {
                this.log("Session now ready and connection was already open. Starting recording.")
                this.sendToFrontend("GEMINI_CONNECTED")
                this.startRecording()
            }
            
            this.log('Step 4: live.connect call initiated...');
        } catch (error) {
            this.error('Establishing Live Connection failed:', error)
            this.connectionOpen = false;
            this.geminiConnecting = false;
            this.liveSession = null
            // applyDefaultState(true) // Preserve API key, but reset connection state
            this.sendToFrontend("HELPER_ERROR", { error: `Live Connection attempt failed: ${error.message || error}` })
            // Trigger reconnect logic from onclose by simulating a closure if it's a retryable situation
            // For now, let onclose handle retries if the error leads to it.
            // If it was a connection attempt, the onclose of the failed attempt should trigger retry.
            // This catch is for synchronous errors from the .connect() call itself.
            this.reconnectAttempts++;
            if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                this.warn(`Retrying connection after synchronous error. Attempt #${this.reconnectAttempts}`);
                setTimeout(() => this.establishLiveConnectionAndRecord(), this.reconnectDelay);
            } else {
                this.error("Max reconnect attempts reached after synchronous connection error.");
                this.isPermanentlyDisconnected = true;
            }
        }
    },

    // Handle messages from the module frontend
    socketNotificationReceived: async function(notification, payload) {
        switch (notification) {
            case "INIT": // Notification from MMM-Gemini.js with API key and location
                this.log('>>> socketNotificationReceived: Handling INIT');
                if (payload.apiKey) {
                    this.apiKey = payload.apiKey;
                    // Initialize API instances if not already done and apiKey is present
                    if (!this.apiInitialized && !this.apiInitializing) {
                        this.log("API key received via INIT, attempting to initialize API instances.");
                        await this.initializeApiInstances(this.apiKey); 
                    }
                } else if (!this.apiKey) { // Only error if API key is still missing
                    this.error('INIT received without API key and no key stored previously');
                    this.sendToFrontend("HELPER_ERROR", { error: "API key not provided for instance initialization" });
                    return;
                }

                if (payload.location) {
                    this.userLocation = payload.location;
                    this.log('User location received and stored:', this.userLocation);
                } else {
                    this.log('No location data received in INIT payload.');
                }
                break;
            case "START_CONNECTION": // This is now mostly a legacy path, INIT should handle API key
                this.log('>>> socketNotificationReceived: Handling START_CONNECTION (Legacy)');
                if (!payload || !payload.apiKey) {
                     this.log('START_CONNECTION received without API key, relying on key from INIT or previous.');
                     if (!this.apiKey) {
                        this.error('API key missing (not provided in START_CONNECTION or prior INIT).');
                        this.sendToFrontend("HELPER_ERROR", { error: "API key not provided by frontend" });
                        return;
                     }
                 } else {
                    this.apiKey = payload.apiKey; // Update if provided
                 }

                try { 
                    // Ensure API instances are initialized before trying to connect
                    if (!this.apiInitialized && !this.apiInitializing) {
                        this.log("API not initialized during START_CONNECTION, attempting initialization.");
                        await this.initializeApiInstances(this.apiKey);
                    } else if (this.apiInitialized) {
                        this.log("API already initialized, START_CONNECTION will ensure connection is attempted if needed.");
                        // If API is initialized, but not connected, ACTIVATE_LISTENING should trigger connection.                        
                    }
                } catch (error) {
                     this.error('>>> socketNotificationReceived: Error calling initializeApiInstances from START_CONNECTION:', error);
                     this.sendToFrontend("HELPER_ERROR", { error: `Error initializing API instances: ${error.message}` });
                 }
                break;
            case "ACTIVATE_LISTENING":
                this.log('>>> socketNotificationReceived: Handling ACTIVATE_LISTENING');
                if (!this.apiInitialized) {
                    this.error("Cannot activate listening: API instances not yet initialized. Ensure START_CONNECTION with API key was sent and successful.");
                    this.sendToFrontend("HELPER_ERROR", { error: "API not ready. Please wait or check API key." });
                    // Optionally, try to initialize if apiKey is somehow available but not initialized
                    if (this.apiKey && !this.apiInitialized && !this.apiInitializing) {
                        this.warn("Attempting to initialize API instances before activating listening...");
                        await this.initializeApiInstances(this.apiKey);
                        if (this.apiInitialized) {
                            await this.establishLiveConnectionAndRecord();
                        }
                    } else if (!this.apiKey) {
                         this.sendToFrontend("HELPER_ERROR", { error: "API Key not available to initialize API." });
                    }
                    return;
                }
                
                // If recording is active but muted, just unmute
                if (this.isRecording && this.isMuted) {
                    this.log("Microphone already active but muted. Unmuting...");
                    this.isMuted = false;
                    this.sendToFrontend("RECORDING_STARTED");
                    return;
                }
                
                // If connection is open and ready, just start recording without establishing a new connection
                if (this.connectionOpen && this.liveSession && this.liveSessionReady && !this.isRecording) {
                    this.log("Connection already open and ready. Starting recording immediately.");
                    this.startRecording();
                    return;
                }
                
                // Reset disconnect flag if user explicitly tries to activate, allowing new attempts
                this.isPermanentlyDisconnected = false;
                this.reconnectAttempts = 0; 
                await this.establishLiveConnectionAndRecord();
                break;
            case "MUTE_MICROPHONE":
                this.log('>>> socketNotificationReceived: Handling MUTE_MICROPHONE');
                if (this.isRecording) {
                    this.log("Muting microphone by setting isMuted=true. User audio will stop sending. Assistant playback should continue.");
                    this.isMuted = true; // This stops new audio from being sent to Gemini
                    this.sendToFrontend("MICROPHONE_MUTED"); // UI update
                    
                    // Removed logic that cleared audioQueue and stopped processQueue
                    // Muting user input should not forcibly stop assistant output.
                } else {
                    this.warn("Cannot mute microphone - not currently recording");
                }
                break;
            case "DEACTIVATE_LISTENING": // Full disconnect - closes connection
                this.log('>>> socketNotificationReceived: Handling DEACTIVATE_LISTENING');
                // Stop recording if active
                if (this.isRecording) {
                    this.stopRecording(true);
                }
                
                if (this.liveSession && this.connectionOpen) {
                    this.log("Closing Live API session due to DEACTIVATE_LISTENING.");
                    this.isPermanentlyDisconnected = true; // Prevent onclose from auto-retrying this session
                    await this.liveSession.close();
                    this.connectionOpen = false;
                    this.liveSession = null;
                    this.sendToFrontend("GEMINI_DISCONNECTED");
                    // Allow new connections upon next ACTIVATE_LISTENING
                    setTimeout(() => { this.isPermanentlyDisconnected = false; }, 100); 
                }
                break;
            case "STOP_RECORDING": // Now this actually stops the recording process completely
                this.log('>>> socketNotificationReceived: Handling STOP_RECORDING');
                this.stopRecording(false); // Stop recording but don't force close the connection
                this.sendToFrontend("RECORDING_STOPPED");
                
                // If stopping recording during an assistant response, make sure we signal an interruption
                if (this.processingQueue || this.audioQueue.length > 0) {
                    this.log(">>> Handling STOP_RECORDING during active assistant response - signaling interruption");
                    // Clear audio queue and stop any ongoing playback
                    this.audioQueue = [];
                    this.processQueue(true);
                    // Signal readiness for new input
                    this.sendToFrontend("GEMINI_TURN_COMPLETE", {});
                }
                break;
            // START_CONTINUOUS_RECORDING is removed as recording now starts via ACTIVATE_LISTENING->onopen
        }
    },

    // Start continuous audio recording and streaming
    startRecording() {
        this.log(">>> startRecording called")

        if (this.isRecording) {
            this.warn("startRecording called but already recording")
            return
        }
        if (!this.connectionOpen || !this.liveSession) {
            this.error("Cannot start recording: Live session not open")
            this.sendToFrontend("HELPER_ERROR", { error: "Cannot start recording: API connection not open" })
            return
        }
        
        // Always ensure liveSessionReady is true when we have a valid connection
        if (this.connectionOpen && this.liveSession && !this.liveSessionReady) {
            this.log("Connection is open but session wasn't marked ready. Fixing state.")
            this.liveSessionReady = true;
        }

        this.isRecording = true
        this.isMuted = false
        this.log(">>> startRecording: Sending RECORDING_STARTED to frontend")
        this.sendToFrontend("RECORDING_STARTED")

        const recorderOptions = {
            sampleRate: INPUT_SAMPLE_RATE,
            channels: CHANNELS,
            audioType: AUDIO_TYPE,
            encoding: ENCODING,
            bits: BITS,
            threshold: 0,
            recorder: 'sox',
            device: 'plughw:3,0'
        }

        this.log(">>> startRecording: Recorder options:", recorderOptions)
        this.log(`>>> startRecording: Using input MIME Type: ${GEMINI_INPUT_MIME_TYPE}`)

        try {
            this.log(">>> startRecording: Attempting recorder.record()...")
            this.recordingProcess = recorder.record(recorderOptions)
            
            // Add error handler immediately after getting the process
            this.recordingProcess.process.on('error', (err) => {
                this.error("Recording process error:", err)
                this.stopRecording(true)
                this.sendToFrontend("HELPER_ERROR", { error: "Audio capture failed" })
            });
            
             this.log(">>> startRecording: recorder.record() call successful. Setting up streams...")

            const audioStream = this.recordingProcess.stream()
            let chunkCounter = 0 // Reset counter for new recording session

            audioStream.on('data', async (chunk) => {
                // Add detailed logging
                this.log(`Audio chunk received: ${chunk.length} bytes, muted: ${this.isMuted}`);
                
                // Instead of skipping completely when muted, we'll send an empty/silence buffer
                // This keeps the audio stream to Gemini alive rather than "stopping" it
                let audioToSend = chunk;
                if (this.isMuted) {
                    this.log(`Microphone is muted - sending silent buffer to maintain connection stream`);
                    // Create a buffer of zeros (silence) with same size as typical chunk
                    // This maintains the connection but doesn't send actual audio
                    audioToSend = Buffer.alloc(chunk.length, 0);
                }

                // Restore the connection checks
                if (!this.isRecording || !this.connectionOpen || !this.liveSession) {
                    if (this.isRecording) {
                        // Keep previous log or revert to original
                        this.warn(`Recording stopping mid-stream: Session/Connection invalid...`)
                        this.stopRecording(true) // Force stop if state is inconsistent
                    }
                    return
                }

                if (chunk.length === 0) {
                    return // Skip empty chunks
                }

                const base64Chunk = audioToSend.toString('base64') // Encode the actual or silent audio
                chunkCounter++ // Increment counter for valid chunks

                // --- Start of Code to UN-Comment ---

                try {
                    const payloadToSend = {
                        media: {
                            mimeType: GEMINI_INPUT_MIME_TYPE,
                            data: base64Chunk
                        }
                    }

                    // Log the payload size with muted status
                    this.log(`Sending payload to Gemini: ${base64Chunk.length} bytes (base64) [muted: ${this.isMuted}]`);

                    // Check liveSession again just before sending
                    if (this.liveSession && this.connectionOpen) {
                        const sendStart = Date.now();
                        await this.liveSession.sendRealtimeInput(payloadToSend);
                        this.log(`Send completed in ${Date.now() - sendStart}ms [muted: ${this.isMuted}]`);
                    } else {
                        this.warn(`Cannot send chunk #${chunkCounter}, connection/session lost just before send`)
                        this.stopRecording(true) // Stop recording if connection lost
                    }
                } catch (apiError) {
                    // Add more detailed error logging
                    this.error(`API Error details: ${JSON.stringify(apiError, Object.getOwnPropertyNames(apiError))}`);
                    const errorTime = new Date().toISOString()
                    this.error(`[${errorTime}] Error sending audio chunk #${chunkCounter}:`, apiError)

                    if (apiError.stack) {
                        this.error(`Gemini send error stack:`, apiError.stack)
                    }

                     // Check specific error types if possible, otherwise assume connection issue
                    if (apiError.message?.includes('closed') || apiError.message?.includes('CLOSING') || apiError.code === 1000 || apiError.message?.includes('INVALID_STATE')) {
                         this.warn("API error suggests connection closed/closing or invalid state")
                         this.connectionOpen = false // Update state
                    }

                    this.sendToFrontend("HELPER_ERROR", { error: `API send error: ${apiError.message}` })
                    this.stopRecording(true) // Force stop on API error
                }

                // --- End of Code to UN-Comment ---

            })

            audioStream.on('error', (err) => {
                this.error(`Recording stream error:`, err)

                if (err.stack) {
                    this.error(`Recording stream error stack:`, err.stack)
                }

                this.sendToFrontend("HELPER_ERROR", { error: `Audio recording stream error: ${err.message}` })
                this.stopRecording(true) // Force stop on stream error
            })

             audioStream.on('end', () => {
                 this.warn(`Recording stream ended`) // Normal if stopRecording was called, unexpected otherwise
                 if (this.isRecording) {
                      // This might happen if the underlying recording process exits for some reason
                      this.error("Recording stream ended while isRecording was still true (unexpected)")
                      this.sendToFrontend("HELPER_ERROR", { error: "Recording stream ended unexpectedly" })
                      this.stopRecording(true) // Ensure state is consistent
                 }
             })

            this.recordingProcess.process.on('exit', (code, signal) => {
                const wasRecording = this.isRecording // Capture state before potential modification
                this.log(`Recording process exited with code ${code}, signal ${signal}`) // Changed from warn to log

                const currentProcessRef = this.recordingProcess // Store ref before nullifying

                this.recordingProcess = null // Clear the reference immediately

                if (wasRecording) {
                    // If we *thought* we were recording when the process exited, it's an error/unexpected stop
                    this.error(`Recording process exited unexpectedly while isRecording was true`)
                    this.sendToFrontend("HELPER_ERROR", { error: `Recording process stopped unexpectedly (code: ${code}, signal: ${signal})` })
                    this.isRecording = false // Update state
                    this.sendToFrontend("RECORDING_STOPPED") // Notify frontend it stopped
                }
                else {
                    // If isRecording was already false, this exit is expected (due to stopRecording being called)
                    this.log(`Recording process exited normally after stop request`)
                }
            })

        } catch (recordError) {
            this.error(">>> startRecording: Failed to start recording process:", recordError)

            if (recordError.stack) {
                this.error(">>> startRecording: Recording start error stack:", recordError.stack)
            }

            this.sendToFrontend("HELPER_ERROR", { error: `Failed to start recording: ${recordError.message}` })

            this.isRecording = false // Ensure state is correct
            this.recordingProcess = null // Ensure reference is cleared
        }
    },

    // Stop audio recording
    stopRecording(force = false) {
        if (this.isRecording || force) {
            if (!this.recordingProcess) {
                this.log(`stopRecording called (Forced: ${force}) but no recording process instance exists`)
                 if (this.isRecording) {
                      this.warn("State discrepancy: isRecording was true but no process found. Resetting state")
                      this.isRecording = false
                      this.sendToFrontend("RECORDING_STOPPED") // Notify frontend about the state correction
                 }
                 return
            }

            this.log(`Stopping recording process (Forced: ${force})...`)
            const wasRecording = this.isRecording // Capture state before changing
            this.isRecording = false // Set flag immediately

            // Store process reference before potentially nullifying it in callbacks
            const processToStop = this.recordingProcess

            try {
                const stream = processToStop.stream()
                if (stream) {
                    this.log("Removing stream listeners")
                    stream.removeAllListeners('data')
                    stream.removeAllListeners('error')
                    stream.removeAllListeners('end')
                }

                 if (processToStop.process) {
                    this.log("Removing process 'exit' listener")
                    processToStop.process.removeAllListeners('exit')

                    this.log("Sending SIGTERM to recording process")
                    processToStop.process.kill('SIGTERM')


                 } else {
                    this.warn("No underlying process found in recordingProcess object to kill")
                 }

                 // Call the library's stop method, which might also attempt cleanup
                 this.log(`Calling recorder.stop()...`)
                 processToStop.stop()

            } catch (stopError) {
                this.error(`Error during recorder cleanup/stop():`, stopError)
                if (stopError.stack) {
                    this.error(`Recorder stop() error stack:`, stopError.stack)
                }
            } finally {
                // Don't nullify this.recordingProcess here; let the 'exit' handler do it.
                if (wasRecording) {
                    this.log("Recording stop initiated. Sending RECORDING_STOPPED if process exits")
                    // Actual RECORDING_STOPPED is sent by the 'exit' handler or state correction logic
                    
                    // Ensure the connection is still considered ready for future recordings
                    if (!force) {
                        this.log("Ensuring session remains marked as ready for future recordings");
                        // Reset any flags that might prevent future recordings
                        this.sendToFrontend("RECORDING_STOPPED");
                    }
                } else {
                     this.log("Recording was already stopped or stopping, no state change needed")
                }
            }
        } else {
            this.log(`stopRecording called, but isRecording flag was already false`)
            // Defensive cleanup if process still exists somehow
            if (this.recordingProcess) {
                 this.warn("stopRecording called while isRecording=false, but process existed. Forcing cleanup")
                 this.stopRecording(true) // Force stop to clean up the zombie process
            }
        }
    },

    // Handle function calls requested by Gemini
    async handleFunctionCall(functioncall) {
        let functionName = functioncall.name
        let args = functioncall.args

        if(!functionName || !args) {
            this.warn("Received function call without name or arguments:", functioncall)
            return
        }

        this.log(`Handling function call: ${functionName}`)

        switch(functionName) {
            case "generate_image":
                let generateImagePrompt = args.image_prompt
                if (generateImagePrompt) {
                    this.log(`Generating image with prompt: "${generateImagePrompt}"`)
                    this.sendToFrontend("GEMINI_IMAGE_GENERATING")
                    try {
                        const response = await this.imaGenAI.models.generateImages({
                            model: 'imagen-3.0-generate-002', // Consider making model configurable
                            prompt: generateImagePrompt,
                            config: {
                                numberOfImages: 1,
                                includeRaiReason: true,
                                personGeneration: PersonGeneration.ALLOW_ADULT,
                            },
                        })

                        // Handle potential safety flags/RAI reasons
                        if (response?.generatedImages?.[0]?.raiReason) {
                             this.warn(`Image generation flagged for RAI reason: ${response.generatedImages[0].raiReason}`)
                             this.sendToFrontend("GEMINI_IMAGE_BLOCKED", { reason: response.generatedImages[0].raiReason })
                        } else {
                            let imageBytes = response?.generatedImages?.[0]?.image?.imageBytes
                            if (imageBytes) {
                                this.log("Image generated successfully")
                                this.sendToFrontend("GEMINI_IMAGE_GENERATED", { image: imageBytes })
                            } else {
                                this.error("Image generation response received, but no image bytes found")
                                this.sendToFrontend("HELPER_ERROR", { error: "Image generation failed: No image data" })
                            }
                        }
                    } catch (imageError) {
                         this.error("Error during image generation API call:", imageError)
                         this.sendToFrontend("HELPER_ERROR", { error: `Image generation failed: ${imageError.message}` })
                    }

                } else {
                     this.warn("generate_image call missing 'image_prompt' argument")
                }
                break
            // Add other function cases here if needed
            default:
                this.warn(`Received unhandled function call: ${functionName}`)
        }
    },

    async handleGeminiResponse(message) {
        if (message?.setupComplete) { return } // Ignore setup message

        // Handle the interrupt flag
        if(message?.serverContent?.interrupted) {
            this.log(`Gemini message received: ${JSON.stringify(message)}`);
            this.log("*** Gemini signaled 'interrupted:true'. This likely means user speech input ended or was cut short. Allowing any ongoing/pending Gemini speech to continue. Sending GEMINI_TURN_COMPLETE to frontend. ***");
            
            // We send GEMINI_TURN_COMPLETE so frontend can reset its state (e.g., prepare for new input)
            // but we DO NOT clear the audioQueue or stop the processingQueue here.
            // If Gemini intends to stop its own speech output, it will do so by ceasing to send audio chunks for that turn.
            this.sendToFrontend("GEMINI_TURN_COMPLETE", { reason: "Gemini signaled user input interrupted/ended" });
            
            // If this message ONLY contains 'interrupted:true' and no other substantive content (like text or audio for THIS turn),
            // we can return. This avoids processing an empty 'content' object below.
            // Based on logs, 'interrupted:true' often comes as a standalone status within serverContent.
            const keysInServerContent = Object.keys(message.serverContent);
            const hasOnlyInterrupted = keysInServerContent.length === 1 && message.serverContent.interrupted === true;
            const hasInterruptedAndTurnComplete = keysInServerContent.length === 2 && message.serverContent.interrupted === true && message.serverContent.hasOwnProperty('turnComplete');

            if (hasOnlyInterrupted || hasInterruptedAndTurnComplete) {
                 // If the 'interrupted' flag is the main piece of info (possibly with turnComplete),
                 // we've handled it by sending GEMINI_TURN_COMPLETE.
                 // Further processing of 'content' might not be relevant for this specific message.
                 // However, let 'turnComplete' be handled by its own section if present.
                 if (hasOnlyInterrupted && !message.serverContent.turnComplete) return; // Return if ONLY interrupted and no other useful payload for this immediate processing step
            }
            // If 'interrupted' comes with other content (e.g. a final text part), allow processing to continue.
        }

        let content = message?.serverContent?.modelTurn?.parts?.[0];

        // Handle Text
        if (content?.text) {
            this.log(`Extracted text: ` + content.text);
            this.sendToFrontend("GEMINI_TEXT_RESPONSE", { text: content.text });
        }

        // Extract and Queue Audio Data
        let extractedAudioData = content?.inlineData?.data;
        if (extractedAudioData) {
            this.log(`Received audio data from Gemini (base64 length: ${extractedAudioData.length}, isMuted: ${this.isMuted})`);
            this.audioQueue.push(extractedAudioData);
            this.log(`Audio queue length after push: ${this.audioQueue.length}`);

            if (!this.processingQueue) {
                this.log(`Starting playback because audio received and queue not processing.`);
                this.processQueue(false); // Start the playback loop
            } else {
                this.log(`Audio queued but playback already in progress (queue length: ${this.audioQueue.length})`);
            }
        }

        let functioncall = message?.toolCall?.functionCalls?.[0];
        // Handle Function Calls
        if (functioncall) {
            await this.handleFunctionCall(functioncall);
        }

        // Check for Turn Completion (can be separate from or accompany 'interrupted')
        // We only want to send GEMINI_TURN_COMPLETE once if 'interrupted' already did so for this message.
        // The 'interrupted' block above now sends GEMINI_TURN_COMPLETE.
        // If 'turnComplete' is also true in a message that also had 'interrupted', we avoid sending it twice from here.
        if (message?.serverContent?.turnComplete) {
            if (!message?.serverContent?.interrupted) { // Only if not already handled by the interrupted block for THIS message
                this.log("Gemini signaled 'turnComplete:true' (and not 'interrupted' in the same message context that sent turn_complete).");
                this.sendToFrontend("GEMINI_TURN_COMPLETE", { reason: "Gemini signaled full turn completion" });
            } else {
                this.log("Gemini signaled 'turnComplete:true' (likely alongside 'interrupted:true' which already sent a GEMINI_TURN_COMPLETE). No duplicate send.");
            }
        }
    },

    // Process the audio queue for playback
    processQueue(interrupted) {
        // Add detailed logging for queue processing events
        this.log(`processQueue called with interrupted=${interrupted}, queue length=${this.audioQueue.length}, processingQueue=${this.processingQueue}, isMuted=${this.isMuted}`);
        
        // 1. Check Stop Condition (Queue Empty)
        if (this.audioQueue.length === 0) {
            this.log("processQueue: Queue is empty. Playback loop ending")
            // Speaker should be closed by the last write callback's .end()
            // Safeguard: ensure flag is false and close speaker if it exists.
            this.processingQueue = false
            if (!interrupted && this.persistentSpeaker) {
                this.warn("processQueue found empty queue but speaker exists! Forcing close")
                this.closePersistentSpeaker()
            }
            
            // If this was an interruption, signal the UI that we're ready for new input
            if (interrupted) {
                this.log("Playback was interrupted, signaling readiness for new input")
                this.sendToFrontend("GEMINI_TURN_COMPLETE", {})
            }
            
            return
        }

        // 2. Ensure Playback Flag is Set
        if (!this.processingQueue) {
             this.processingQueue = true
             this.log("processQueue: Starting playback loop")
        }

        // 3. Ensure Speaker Exists (Create ONLY if needed)
        if (!this.persistentSpeaker || this.persistentSpeaker.destroyed) {
            this.log("Creating new persistent speaker instance")
            try {
                this.persistentSpeaker = new Speaker({
                    channels: CHANNELS,
                    bitDepth: BITS,
                    sampleRate: OUTPUT_SAMPLE_RATE,
                })

                this.persistentSpeaker.once('error', (err) => {
                    this.error('Persistent Speaker Error:', err)
                    this.closePersistentSpeaker()
                })

                this.persistentSpeaker.once('close', () => {
                    this.log('Persistent Speaker Closed Event')
                    // Ensure state is clean if closed unexpectedly or after end()
                    this.persistentSpeaker = null
                    if (this.processingQueue) {
                         this.log('Speaker closed. Resetting processing flag')
                         this.processingQueue = false
                    }
                })

                this.persistentSpeaker.once('open', () => this.log('Persistent Speaker opened'))

            } catch (e) {
                this.error('Failed to create persistent speaker:', e)
                this.persistentSpeaker = null
                this.processingQueue = false 
                this.audioQueue = []
                return
            }
        }

         // Check again after attempting creation
         if (!this.persistentSpeaker) {
             this.error("Cannot process queue, speaker instance is not available")
             this.processingQueue = false // Stop processing
             return
         }

        // 4. Get and Write ONE Chunk
        const chunkBase64 = this.audioQueue.shift() // Take the next chunk
        const buffer = Buffer.from(chunkBase64, 'base64')

        this.persistentSpeaker.write(buffer, (err) => {
            if (err) {
                this.error("Error writing buffer to persistent speaker:", err)
                // Speaker error listener should handle cleanup via closePersistentSpeaker()
                // Avoid calling closePersistentSpeaker directly here to prevent race conditions
                return
            }

            // 5. Decide Next Step (Continue Loop or End Stream)
            if (this.audioQueue.length > 0) {
                // More chunks waiting? Immediately schedule the next write
                this.processQueue(false)
            } else {
                // Queue is empty *after* taking the last chunk
                this.log("Audio queue empty after playing chunk. Ending speaker stream gracefully")
                 if (this.persistentSpeaker && !this.persistentSpeaker.destroyed) {
                     // Call end() - allows last chunk to play, then 'close' event fires
                     this.persistentSpeaker.end(() => {
                        this.log("Speaker .end() callback fired after last chunk write")
                        // The 'close' listener handles the actual state cleanup
                     })
                 } else {
                     // Speaker already gone? Ensure flag is false
                     this.processingQueue = false
                 }
            }
        })
    },

    closePersistentSpeaker() {
        if (this.persistentSpeaker && !this.persistentSpeaker.destroyed) {
            this.log("Closing persistent speaker...")
            try {
                 // Remove listeners to prevent acting on events after initiating close
                 this.persistentSpeaker.removeAllListeners() // Remove all listeners associated with this speaker

                 // Call end to flush and close gracefully
                 // The 'close' event should ideally handle state reset, but do it defensively here too
                 this.persistentSpeaker.end(() => {
                     this.log("Speaker .end() callback fired during closePersistentSpeaker")
                 })
                 this.persistentSpeaker = null
                 this.processingQueue = false // Reset state immediately after initiating close
                 this.log("Speaker close initiated, state reset")

            } catch (e) {
                this.error("Error trying to close persistent speaker:", e)
                this.persistentSpeaker = null // Ensure null even if close fails
                this.processingQueue = false
            }
        } else {
            // If speaker doesn't exist or already destroyed, ensure state is correct
            this.persistentSpeaker = null
            this.processingQueue = false
        }
    }

})