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
                this.startRecording();
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
                        parts: [ { text: 'Your name is Kagami. You are a helpful and knowledgeable virtual assistant designed to make daily life easier. You have a friendly, approachable personality and genuinely enjoy helping people with their questions, tasks, and providing useful information. When you break from a story to show an image from the story, please continue telling the story after calling the function without needing to be prompted. This also applies if you are interrupted to show an image. You should try to continue with informative explanations without requiring constant user input. Provide relevant, practical information about day-to-day questions and tasks. Your default language is English, but you should respond in the input audio language from the speaker if you detect a non-English language. You must respond unmistakably in the language that the speaker inputs via audio, please.' }],
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
            case "START_CONNECTION": // This will now only initialize API instances
                this.log('>>> socketNotificationReceived: Handling START_CONNECTION (Initialize API Instances)');
                if (!payload || !payload.apiKey) {
                     this.error('START_CONNECTION received without API key');
                     this.sendToFrontend("HELPER_ERROR", { error: "API key not provided by frontend for instance initialization" });
                     return;
                 }
                try { 
                    await this.initializeApiInstances(payload.apiKey);
                } catch (error) {
                     this.error('>>> socketNotificationReceived: Error calling initializeApiInstances:', error);
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
                // Reset disconnect flag if user explicitly tries to activate, allowing new attempts
                this.isPermanentlyDisconnected = false;
                this.reconnectAttempts = 0; 
                await this.establishLiveConnectionAndRecord();
                break;
            case "DEACTIVATE_LISTENING": // Placeholder for future use
                this.log('>>> socketNotificationReceived: Handling DEACTIVATE_LISTENING');
                this.stopRecording(true); // Stop recording
                if (this.liveSession && this.connectionOpen) {
                    this.log("Closing Live API session due to DEACTIVATE_LISTENING.");
                    // this.liveSession.close(); // This would trigger onclose and its retry logic.
                    // For a cleaner stop without immediate retry from DEACTIVATE:
                    this.isPermanentlyDisconnected = true; // Prevent onclose from auto-retrying this session
                    await this.liveSession.close();
                    this.connectionOpen = false;
                    this.liveSession = null;
                    this.sendToFrontend("GEMINI_DISCONNECTED");
                     // Allow new connections upon next ACTIVATE_LISTENING
                    setTimeout(() => { this.isPermanentlyDisconnected = false; }, 100); 
                }
                break;
            // START_CONTINUOUS_RECORDING is removed as recording now starts via ACTIVATE_LISTENING->onopen
        }
    },

    // // Start continuous audio recording and streaming
    startRecording() {
        this.log(">>> startRecording called")

        if (this.isRecording) {
            this.warn("startRecording called but already recording")
            return
        }
        if (!this.connectionOpen || !this.liveSession || !this.liveSessionReady) {
            this.error("Cannot start recording: Live session not open or not ready")
            this.sendToFrontend("HELPER_ERROR", { error: "Cannot start recording: API connection not fully ready" })
             return
        }

        this.isRecording = true
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
                this.log(`Audio chunk received: ${chunk.length} bytes`);

                // Log the first few bytes for debugging
                // this.log(`First 10 bytes: ${chunk.slice(0, 10).toString('hex')}`);

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

                const base64Chunk = chunk.toString('base64') // Restore encoding
                chunkCounter++ // Increment counter for valid chunks

                // --- Start of Code to UN-Comment ---

                try {
                    const payloadToSend = {
                        media: {
                            mimeType: GEMINI_INPUT_MIME_TYPE,
                            data: base64Chunk
                        }
                    }

                    // Log the payload size
                    this.log(`Sending payload to Gemini: ${base64Chunk.length} bytes (base64)`);

                    // Check liveSession again just before sending
                    if (this.liveSession && this.connectionOpen) {
                        const sendStart = Date.now();
                        await this.liveSession.sendRealtimeInput(payloadToSend);
                        this.log(`Send completed in ${Date.now() - sendStart}ms`);
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
            this.log("message: " + JSON.stringify(message))
            this.log("*** Interrupting ***")
            this.audioQueue = []
            this.processQueue(true)
            return
        }

        let content = message?.serverContent?.modelTurn?.parts?.[0]

        // Handle Text
        if (content?.text) {
            this.log(`Extracted text: ` + content.text)
            this.sendToFrontend("GEMINI_TEXT_RESPONSE", { text: content.text })
        }

        // Extract and Queue Audio Data
        let extractedAudioData = content?.inlineData?.data
        if (extractedAudioData) {
            this.audioQueue.push(extractedAudioData)

            // --- Trigger Playback if Threshold Reached and Not Already Playing ---
            if (!this.processingQueue) {
                this.log(`Starting playback`)
                this.processQueue(false) // Start the playback loop
            }
        }

        let functioncall = message?.toolCall?.functionCalls?.[0]
        // Handle Function Calls
        if (functioncall) {
            await this.handleFunctionCall(functioncall)
        }

        // Check for Turn Completion (LOGGING ONLY when audio, clearing UI in text)
        if (message?.serverContent?.turnComplete) {
            this.log("Turn complete signal received")
            // Send turn complete notification (still useful for UI)
            this.sendToFrontend("GEMINI_TURN_COMPLETE", {})
        }
    },

    // // Process the audio queue for playback
    processQueue(interrupted) {
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