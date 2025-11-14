/*
 * ESP32 Firebase Realtime Database Controller
 * 
 * This program connects an ESP32 to Firebase Realtime Database to control
 * peripherals (LEDs, motors, etc.) remotely via a web app. The ESP32 listens
 * for state changes in Firebase and updates GPIO pins accordingly.
 * 
 * Communication Flow:
 * 1. Web app writes state (0 or 1) to Firebase path: "device_name/state"
 * 2. ESP32 streams this Firebase path for real-time updates
 * 3. When state changes, ESP32 updates the corresponding GPIO pin
 * 
 * TO ADD A NEW PERIPHERAL:
 * 1. Define a new GPIO pin constant (e.g., const int NEW_DEVICE_PIN = 19;)
 * 2. Add pinMode() and initial digitalWrite() in setup()
 * 3. Add a new Firebase stream listener in setup() for the new device
 * 4. Add state tracking variable (e.g., int last_new_device_state = -1;)
 * 5. Add stream reading logic in loop() to handle the new device
 * 6. Update the web app files (app.js and dashboard.html) - see comments there
 */

#include <Arduino.h>
#include <WiFi.h>
#include <FirebaseESP32.h>

// ============================================================================
// CONFIGURATION SECTION - Update these values as needed
// ============================================================================

// Firebase Realtime Database URL (DO NOT CHANGE unless database URL changes)
// Format: hostname only, no protocol (https://) or trailing slash (/)
#define REALTIME_DATABASE_URL "cat-automated-smart-home-default-rtdb.firebaseio.com"
// #define REALTIME_DATABASE_URL "..."

// WiFi network credentials - UPDATE THESE WITH YOUR NETWORK INFO
const char* SSID = "...";
const char* PASSWORD = "...";

// ============================================================================
// PERIPHERAL PIN DEFINITIONS
// ============================================================================
// Define GPIO pins for each peripheral connected to the ESP32
// TO ADD A NEW PERIPHERAL: Add a new const int here with your GPIO pin number
const int HEATING_PAD_PIN = 5;           // GPIO pin for heating pad control
const int TEMPERATURE_SENSOR_PIN = 18;   // GPIO pin for temperature sensor LED

// ============================================================================
// FIREBASE CONFIGURATION OBJECTS
// ============================================================================
// These objects handle Firebase connection and data streaming
FirebaseData firebaseData;      // Object to hold Firebase data and stream info
FirebaseAuth auth;               // Firebase authentication object
FirebaseConfig config;           // Firebase configuration settings

// ============================================================================
// STATE TRACKING VARIABLES
// ============================================================================
// Track last known state to avoid unnecessary GPIO updates
// TO ADD A NEW PERIPHERAL: Add a new tracking variable here
int last_temperature_sensor_state = -1;  // -1 = unknown, 0 = off, 1 = on

// ============================================================================
// SETUP FUNCTION - Runs once when ESP32 starts
// ============================================================================
void setup(void) {
  // Initialize serial communication for debugging (115200 baud)
  Serial.begin(115200);
  delay(100);

  // ========================================================================
  // GPIO PIN INITIALIZATION
  // ========================================================================
  // Configure all peripheral pins as OUTPUT and set them to LOW (off)
  // TO ADD A NEW PERIPHERAL: Add pinMode() and digitalWrite() here
  pinMode(HEATING_PAD_PIN, OUTPUT);
  pinMode(TEMPERATURE_SENSOR_PIN, OUTPUT);
  
  digitalWrite(HEATING_PAD_PIN, LOW);
  digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);
  delay(100);

  // ========================================================================
  // WIFI CONNECTION SETUP
  // ========================================================================
  // Connect ESP32 to local WiFi network
  Serial.print("Connecting to WiFi network: ");
  Serial.println(SSID);
  WiFi.begin(SSID, PASSWORD);
  
  // Wait until WiFi connection is established
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("WiFi connection successful.");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // ========================================================================
  // FIREBASE CONNECTION SETUP
  // ========================================================================
  // Configure Firebase Realtime Database connection
  config.database_url = REALTIME_DATABASE_URL;
  config.signer.test_mode = true;  // No authentication (public database)
  
  // Initialize Firebase connection
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);  // Auto-reconnect WiFi if connection drops
  
  // Wait for Firebase to be ready (with timeout)
  Serial.println("Waiting for Firebase connection...");
  int retryCount = 0;
  while (!Firebase.ready() && retryCount < 10) {
    delay(500);
    Serial.print(".");
    retryCount++;
  }
  Serial.println("");
  
  // Check if Firebase connection was successful
  if (Firebase.ready()) {
    Serial.println("Firebase connected successfully");
  } else {
    Serial.println("Firebase connection failed");
    Serial.println("Error: " + firebaseData.errorReason());
  }

  // ========================================================================
  // FIREBASE STREAM LISTENERS SETUP
  // ========================================================================
  // Set up real-time stream listeners for each peripheral
  // Firebase streams automatically notify ESP32 when data changes
  // TO ADD A NEW PERIPHERAL: Add a new Firebase.beginStream() call here
  
  // Stream listener for temperature sensor state
  // Listens to Firebase path: "/temperature_sensor/state"
  // When web app changes this value, ESP32 receives notification immediately
  if (Firebase.ready()) {
    if (!Firebase.beginStream(firebaseData, "/temperature_sensor/state")) {
      Serial.println("Could not begin stream for temperature_sensor");
      Serial.println("Reason: " + firebaseData.errorReason());
      Serial.println("Error code: " + String(firebaseData.errorCode()));
    } else {
      Serial.println("Temperature sensor stream started successfully");
      Serial.println("Listening to: /temperature_sensor/state");
    }
  } else {
    Serial.println("Cannot start stream - Firebase not ready");
  }

  delay(100);
}

// ============================================================================
// LOOP FUNCTION - Runs continuously after setup()
// ============================================================================
void loop(){
  // ========================================================================
  // FIREBASE CONNECTION HEALTH CHECK
  // ========================================================================
  // Check if Firebase is still connected, reconnect if needed
  if (!Firebase.ready()) {
    // Try to reconnect if WiFi is still connected
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("Firebase not ready, attempting to reconnect...");
      Firebase.reconnectWiFi(false);
      delay(1000);
      
      // Try to restart stream if connection is restored
      if (Firebase.ready() && !firebaseData.streamTimeout()) {
        if (!Firebase.beginStream(firebaseData, "/temperature_sensor/state")) {
          Serial.println("Failed to restart stream: " + firebaseData.errorReason());
        } else {
          Serial.println("Stream restarted successfully");
        }
      }
    } else {
      // WiFi disconnected, try to reconnect
      Serial.println("WiFi disconnected, reconnecting...");
      WiFi.reconnect();
      delay(2000);
    }
    return;  // Exit loop iteration if not connected
  }

  // ========================================================================
  // READ FIREBASE STREAM DATA
  // ========================================================================
  // Check for new data from Firebase stream
  // TO ADD A NEW PERIPHERAL: You'll need to handle multiple streams
  // Option 1: Use separate FirebaseData objects for each device
  // Option 2: Use a single stream and check which path changed
  if (!Firebase.readStream(firebaseData)) {
    // Handle stream errors
    if (firebaseData.streamTimeout()) {
      Serial.println("Stream timeout, restarting...");
      if (Firebase.beginStream(firebaseData, "/temperature_sensor/state")) {
        Serial.println("Stream restarted");
      }
    } else {
      Serial.println("Stream read error: " + firebaseData.errorReason());
    }
    delay(1000);
    return;
  }

  // ========================================================================
  // PROCESS STREAM DATA AND UPDATE GPIO PINS
  // ========================================================================
  // Check if new data is available from the stream
  if (firebaseData.streamAvailable()) {
    // Get the state value from Firebase (0 = off, 1 = on)
    int state = firebaseData.intData();
    
    Serial.print("Temperature sensor state changed to: ");
    Serial.println(state);
    
    // Only update GPIO if state actually changed (avoid unnecessary writes)
    if (state != last_temperature_sensor_state) {
      last_temperature_sensor_state = state;
      
      // Update GPIO pin based on state
      if (state == 1) {
        Serial.println("Turning temperature sensor LED ON (GPIO 18 HIGH)");
        digitalWrite(TEMPERATURE_SENSOR_PIN, HIGH);
      } else {
        Serial.println("Turning temperature sensor LED OFF (GPIO 18 LOW)");
        digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);
      }
    }
  }

  // Small delay to prevent overwhelming the system
  delay(100);
}

/*
 * ============================================================================
 * INSTRUCTIONS FOR ADDING A NEW PERIPHERAL (e.g., Motor, LED, Relay)
 * ============================================================================
 * 
 * Example: Adding a "Water Pump" controlled by GPIO 19
 * 
 * STEP 1: Define the GPIO pin (add near line 30)
 *   const int WATER_PUMP_PIN = 19;
 * 
 * STEP 2: Initialize the pin in setup() (add near line 50)
 *   pinMode(WATER_PUMP_PIN, OUTPUT);
 *   digitalWrite(WATER_PUMP_PIN, LOW);
 * 
 * STEP 3: Add state tracking variable (add near line 40)
 *   int last_water_pump_state = -1;
 * 
 * STEP 4: Add Firebase stream listener in setup() (add near line 90)
 *   FirebaseData waterPumpData;  // Create separate FirebaseData object
 *   if (Firebase.beginStream(waterPumpData, "/water_pump/state")) {
 *     Serial.println("Water pump stream started");
 *   }
 * 
 * STEP 5: Add stream reading logic in loop() (add near line 130)
 *   if (Firebase.readStream(waterPumpData)) {
 *     if (waterPumpData.streamAvailable()) {
 *       int state = waterPumpData.intData();
 *       if (state != last_water_pump_state) {
 *         last_water_pump_state = state;
 *         digitalWrite(WATER_PUMP_PIN, state == 1 ? HIGH : LOW);
 *       }
 *     }
 *   }
 * 
 * STEP 6: Update web app files:
 *   - app.js: Add device mapping in controlDevice() and refreshStatus()
 *   - dashboard.html: Add new device card section
 * 
 * IMPORTANT: The Firebase path must match between ESP32 and web app!
 *   ESP32 listens to: "/water_pump/state"
 *   Web app writes to: "water_pump/state" (no leading slash in web app)
 */
