/**
 * CASH (Cat Automated Smart Home) Web Application
 * 
 * This JavaScript file handles:
 * 1. Firebase Authentication (login/signup)
 * 2. Firebase Realtime Database communication
 * 3. Device control interface (turning devices on/off)
 * 4. Real-time status updates from Firebase
 * 
 * Communication Flow:
 * - User clicks button → controlDevice() writes to Firebase
 * - Firebase updates → onValue() listeners update UI automatically
 * - ESP32 reads from Firebase → Updates GPIO pins
 * 
 * TO ADD A NEW PERIPHERAL:
 * 1. Add device mapping in controlDevice() function
 * 2. Add Firebase reference in initDashboardControls()
 * 3. Add onValue() listener in initDashboardControls()
 * 4. Add device case in formatDeviceName()
 * 5. Add device reading in refreshStatus()
 * 6. Add device card HTML in dashboard.html
 */

// ============================================================================
// FIREBASE IMPORTS
// ============================================================================
// Import Firebase core, authentication, and Realtime Database modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getDatabase,
    ref,
    set,
    get,
    onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
// Firebase project configuration. Will not be committed to repo. Just text me for it.
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

// Initialize Firebase services
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);              // Authentication service
const database = getDatabase(firebaseApp);       // Realtime Database service

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
const ESP32_IP_KEY = "esp32_ip_address";  // LocalStorage key (legacy, not used with Firebase)
let messageTimeout;  // Timeout ID for auto-hiding status messages

// DOM selector helper functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

// ============================================================================
// PAGE INITIALIZATION
// ============================================================================
// Initialize all page functionality when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    initTabs();                    // Tab switching (login/signup)
    initAuthForms();               // Login and signup form handlers
    initGoogleAuth();              // Google OAuth login
    initSignOut();                 // Sign out button handler
    initDashboardNavigation();     // Navigation to dashboard
    initDashboardControls();       // Device control setup
});

// ============================================================================
// AUTHENTICATION STATE MONITORING
// ============================================================================
// Monitor Firebase authentication state and show/hide UI elements accordingly
// Redirects to login page if user is not authenticated
onAuthStateChanged(auth, (user) => {
    const authCard = document.getElementById("authCard");
    const appSection = document.getElementById("appSection");
    const signOutBtn = document.getElementById("signOutBtn");
    const userEmail = document.getElementById("userEmail");
    const isDashboard = Boolean(document.getElementById("dashboardPage"));

    if (user) {
        // User is logged in - show app content
        authCard?.classList.add("hidden");
        appSection?.classList.remove("hidden");
        if (signOutBtn) signOutBtn.hidden = false;
        if (userEmail) userEmail.textContent = user.email ?? "User";
    } else {
        // User is not logged in - show login form
        authCard?.classList.remove("hidden");
        appSection?.classList.add("hidden");
        if (signOutBtn) signOutBtn.hidden = true;
        if (userEmail) userEmail.textContent = "";
        // Redirect to login if on dashboard
        if (isDashboard) {
            window.location.href = "./index.html";
        }
    }
});

// ============================================================================
// UI INITIALIZATION FUNCTIONS
// ============================================================================

/**
 * Initialize tab switching functionality (Login/Signup tabs)
 */
function initTabs() {
    const tabs = $$(".tab");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            // Remove active class from all tabs
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");

            // Show/hide corresponding panels
            const target = tab.getAttribute("data-tab");
            const panels = $$(".panel");
            panels.forEach((panel) => {
                const isTarget = panel.getAttribute("data-panel") === target;
                panel.classList.toggle("hidden", !isTarget);
                panel.setAttribute("aria-hidden", String(!isTarget));
            });
        });
    });
}

/**
 * Initialize login and signup form handlers
 */
function initAuthForms() {
    // ========================================================================
    // LOGIN FORM HANDLER
    // ========================================================================
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = /** @type {HTMLInputElement} */ (
                document.getElementById("loginEmail")
            ).value.trim();
            const password = /** @type {HTMLInputElement} */ (
                document.getElementById("loginPassword")
            ).value;
            const messageEl = document.getElementById("loginMessage");
            clearFormMessage(messageEl);

            if (!email || !password) {
                setFormMessage(messageEl, "Please enter email and password.");
                return;
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
                setFormMessage(messageEl, "Logged in successfully.", "success");
                window.location.href = "./dashboard.html";
            } catch (error) {
                console.error("Login error:", error);
                setFormMessage(messageEl, parseAuthError(error));
            }
        });
    }

    // ========================================================================
    // SIGNUP FORM HANDLER
    // ========================================================================
    const signupForm = document.getElementById("signupForm");
    if (signupForm) {
        signupForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const email = /** @type {HTMLInputElement} */ (
                document.getElementById("signupEmail")
            ).value.trim();
            const password = /** @type {HTMLInputElement} */ (
                document.getElementById("signupPassword")
            ).value;
            const messageEl = document.getElementById("signupMessage");
            clearFormMessage(messageEl);

            if (!email || !password || password.length < 6) {
                setFormMessage(
                    messageEl,
                    "Use a valid email and 6+ character password."
                );
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );
                console.log("Account created:", userCredential.user.uid);
                setFormMessage(messageEl, "Account created. You are now signed in.", "success");
                window.location.href = "./dashboard.html";
            } catch (error) {
                console.error("Signup error:", error);
                setFormMessage(messageEl, parseAuthError(error));
            }
        });
    }
}

/**
 * Initialize Google OAuth login button
 */
function initGoogleAuth() {
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    if (!googleLoginBtn) return;

    googleLoginBtn.addEventListener("click", async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            window.location.href = "./dashboard.html";
        } catch (error) {
            console.error("Google login error:", error);
            const messageEl = document.getElementById("loginMessage");
            setFormMessage(messageEl, parseAuthError(error));
        }
    });
}

/**
 * Initialize sign out button handler
 */
function initSignOut() {
    const signOutBtn = document.getElementById("signOutBtn");
    if (!signOutBtn) return;

    signOutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            if (!location.pathname.endsWith("index.html")) {
                window.location.href = "./index.html";
            }
        } catch (error) {
            console.error("Sign out error:", error);
        }
    });
}

/**
 * Initialize dashboard navigation button
 */
function initDashboardNavigation() {
    const goDashboard = document.getElementById("goDashboard");
    if (!goDashboard) return;

    goDashboard.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.href = "./dashboard.html";
    });
}

// ============================================================================
// DASHBOARD DEVICE CONTROL INITIALIZATION
// ============================================================================
/**
 * Initialize dashboard device controls and Firebase listeners
 * This function sets up real-time listeners for each device in Firebase
 * TO ADD A NEW PERIPHERAL: Add Firebase reference and onValue() listener here
 */
function initDashboardControls() {
    // Hide IP input field (not needed with Firebase)
    const ipInput = document.getElementById("esp32-ip");
    if (ipInput) {
        ipInput.style.display = "none";
        const ipLabel = ipInput.previousElementSibling;
        if (ipLabel && ipLabel.tagName === "LABEL") {
            ipLabel.style.display = "none";
        }
    }
    
    // Refresh device status on page load
    refreshStatus();
    
    // ========================================================================
    // FIREBASE REAL-TIME LISTENERS
    // ========================================================================
    // Set up listeners that automatically update UI when Firebase data changes
    // These listeners fire immediately when data changes in Firebase
    // TO ADD A NEW PERIPHERAL: Add a new Firebase reference and onValue() listener
    
    // Listener for heating pad state changes
    const heatingPadRef = ref(database, "heating_pad/state");
    onValue(heatingPadRef, (snapshot) => {
        // Convert Firebase value (0 or 1) to string ("off" or "on")
        const state = snapshot.exists() ? (snapshot.val() === 1 ? "on" : "off") : "unknown";
        updateDeviceStatus("heating_pad", state);
    });
    
    // Listener for temperature sensor state changes
    const temperatureSensorRef = ref(database, "temperature_sensor/state");
    onValue(temperatureSensorRef, (snapshot) => {
        const state = snapshot.exists() ? (snapshot.val() === 1 ? "on" : "off") : "unknown";
        updateDeviceStatus("temperature_sensor", state);
    });
}

// ============================================================================
// DEVICE CONTROL FUNCTIONS
// ============================================================================

/**
 * Control a device by writing state to Firebase
 * This function is called when user clicks "Turn On" or "Turn Off" buttons
 * 
 * @param {string} device - Device identifier (e.g., "heating_pad", "temperature_sensor")
 * @param {string} action - Action to perform ("on" or "off")
 * 
 * TO ADD A NEW PERIPHERAL: Add device mapping in the firebasePath assignment
 */
async function controlDevice(device, action) {
    try {
        // ====================================================================
        // DEVICE TO FIREBASE PATH MAPPING
        // ====================================================================
        // Map device name to Firebase database path
        // TO ADD A NEW PERIPHERAL: Add a new case here
        // Example: const firebasePath = device === "water_pump" ? "water_pump/state" : ...
        const firebasePath = device === "heating_pad" 
            ? "heating_pad/state" 
            : device === "temperature_sensor"
            ? "temperature_sensor/state"
            : null;
        
        if (!firebasePath) {
            showMessage("Unknown device: " + device, "error");
            return;
        }
        
        // Convert action string to state value (1 = on, 0 = off)
        const state = action === "on" ? 1 : 0;
        
        // Write state to Firebase Realtime Database
        // ESP32 will automatically receive this update via its stream listener
        const stateRef = ref(database, firebasePath);
        await set(stateRef, state);
        
        // Show success message and update UI
        showMessage(`${formatDeviceName(device)} turned ${action}`, "success");
        updateDeviceStatus(device, action);
    } catch (error) {
        console.error("Device control error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

/**
 * Refresh device status by reading current values from Firebase
 * This function manually reads all device states from Firebase
 * TO ADD A NEW PERIPHERAL: Add device reading logic here
 */
async function refreshStatus() {
    try {
        // ====================================================================
        // READ DEVICE STATES FROM FIREBASE
        // ====================================================================
        // Create Firebase references for each device
        // TO ADD A NEW PERIPHERAL: Add a new ref() and get() call here
        const heatingPadRef = ref(database, "heating_pad/state");
        const temperatureSensorRef = ref(database, "temperature_sensor/state");
        
        // Read current values from Firebase
        const heatingPadSnapshot = await get(heatingPadRef);
        const temperatureSensorSnapshot = await get(temperatureSensorRef);
        
        // Convert Firebase values (0 or 1) to strings ("off" or "on")
        const heatingPadState = heatingPadSnapshot.exists() 
            ? (heatingPadSnapshot.val() === 1 ? "on" : "off") 
            : "unknown";
        const temperatureSensorState = temperatureSensorSnapshot.exists() 
            ? (temperatureSensorSnapshot.val() === 1 ? "on" : "off") 
            : "unknown";
        
        // Update UI with current states
        updateDeviceStatus("heating_pad", heatingPadState);
        updateDeviceStatus("temperature_sensor", temperatureSensorState);

        showMessage("Status updated", "success");
    } catch (error) {
        console.error("Status refresh error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

/**
 * Update device status indicator in the UI
 * This function updates the visual status indicator and text for a device
 * 
 * @param {string} device - Device identifier (e.g., "heating_pad")
 * @param {string} state - Device state ("on", "off", or "unknown")
 * 
 * TO ADD A NEW PERIPHERAL: Add device ID mapping in the deviceId assignment
 */
function updateDeviceStatus(device, state) {
    // Map device name to HTML element ID
    // HTML element IDs use hyphens, device names use underscores
    // TO ADD A NEW PERIPHERAL: Add a new case here
    // Example: const deviceId = device === "water_pump" ? "water-pump" : ...
    const deviceId = device === "heating_pad" 
        ? "heating-pad" 
        : device === "temperature_sensor"
        ? "temperature-sensor"
        : null;
    
    if (!deviceId) {
        console.error("Unknown device for status update:", device);
        return;
    }
    
    // Get HTML elements for status indicator and text
    const indicator = document.getElementById(`${deviceId}-indicator`);
    const statusText = document.getElementById(`${deviceId}-status`);

    if (!indicator || !statusText) {
        console.error(`Status elements not found for device: ${deviceId}`);
        return;
    }

    // Update CSS class and text based on state
    const normalizedState = typeof state === "string" ? state.toLowerCase() : "unknown";
    indicator.className = `status-indicator ${normalizedState}`;
    statusText.textContent = `Status: ${normalizedState.toUpperCase()}`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get ESP32 IP address from input field (legacy function, not used with Firebase)
 */
function getESP32IP() {
    const ipInput = document.getElementById("esp32-ip");
    if (!ipInput) return null;

    const ip = ipInput.value.trim();
    if (!ip) {
        showMessage("Please enter ESP32 IP address", "error");
        return null;
    }
    return ip;
}

/**
 * Show a temporary status message to the user
 * @param {string} text - Message text to display
 * @param {string} type - Message type ("success", "error", etc.)
 */
function showMessage(text, type) {
    const messageEl = document.getElementById("message");
    if (!messageEl) return;

    clearTimeout(messageTimeout);
    messageEl.textContent = text;
    messageEl.className = `status-message ${type}`;

    // Auto-hide message after 3 seconds
    messageTimeout = window.setTimeout(() => {
        messageEl.textContent = "";
        messageEl.className = "status-message";
    }, 3000);
}

/**
 * Clear form message element
 */
function clearFormMessage(element) {
    if (!element) return;
    element.textContent = "";
    element.className = "form-message";
}

/**
 * Set form message with text and type
 */
function setFormMessage(element, text, type = "error") {
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`;
}

/**
 * Parse Firebase authentication errors into user-friendly messages
 */
function parseAuthError(error) {
    console.error("Full Firebase error:", error);
    if (!error || !error.code) {
        return "Unknown error occurred. Please check console for details.";
    }

    const code = String(error.code);
    const message = error.message || "";

    const errorMap = {
        "invalid-email": "Please enter a valid email address.",
        "invalid-credential": "Invalid email or password.",
        "user-disabled": "This account has been disabled.",
        "user-not-found": "No account found with this email.",
        "wrong-password": "Incorrect password.",
        "email-already-in-use": "An account with this email already exists.",
        "weak-password": "Password should be at least 6 characters.",
        "too-many-requests": "Too many failed attempts. Please try again later.",
        "operation-not-allowed": "This sign-in method is not enabled. Please contact support.",
        "network-request-failed": "Network error. Please check your internet connection.",
        "invalid-api-key": "Configuration error. Please contact support.",
        "app-not-authorized": "App not authorized. Please contact support.",
        "quota-exceeded": "Service temporarily unavailable. Please try again later.",
        "credential-already-in-use": "This credential is already associated with a different account.",
        "account-exists-with-different-credential":
            "An account already exists with a different sign-in method.",
        "invalid-argument": "Invalid input. Please check your email and password.",
        "missing-email": "Please enter an email address.",
        "missing-password": "Please enter a password.",
    };

    for (const [key, value] of Object.entries(errorMap)) {
        if (code.includes(key) || message.toLowerCase().includes(key)) {
            return value;
        }
    }

    return `Error: ${code}. ${message || "Please check console for details."}`;
}

/**
 * Format device name for display in UI
 * Converts device identifier to user-friendly name
 * TO ADD A NEW PERIPHERAL: Add a new case here
 */
function formatDeviceName(device) {
    switch (device) {
        case "heating_pad":
            return "Heating pad";
        case "temperature_sensor":
            return "Temperature sensor";
        // TO ADD A NEW PERIPHERAL: Add case here
        // case "water_pump":
        //     return "Water pump";
        default:
            return device;
    }
}

// ============================================================================
// EXPOSE FUNCTIONS TO GLOBAL SCOPE
// ============================================================================
// Make these functions available to onclick handlers in HTML
window.controlDevice = controlDevice;
window.refreshStatus = refreshStatus;

/*
 * ============================================================================
 * INSTRUCTIONS FOR ADDING A NEW PERIPHERAL
 * ============================================================================
 * 
 * Example: Adding a "Water Pump" device
 * 
 * STEP 1: Add device mapping in controlDevice() function (around line 280)
 *   const firebasePath = device === "water_pump" ? "water_pump/state" : ...
 * 
 * STEP 2: Add Firebase reference in initDashboardControls() (around line 220)
 *   const waterPumpRef = ref(database, "water_pump/state");
 *   onValue(waterPumpRef, (snapshot) => {
 *       const state = snapshot.exists() ? (snapshot.val() === 1 ? "on" : "off") : "unknown";
 *       updateDeviceStatus("water_pump", state);
 *   });
 * 
 * STEP 3: Add device reading in refreshStatus() (around line 300)
 *   const waterPumpRef = ref(database, "water_pump/state");
 *   const waterPumpSnapshot = await get(waterPumpRef);
 *   const waterPumpState = waterPumpSnapshot.exists() 
 *       ? (waterPumpSnapshot.val() === 1 ? "on" : "off") 
 *       : "unknown";
 *   updateDeviceStatus("water_pump", waterPumpState);
 * 
 * STEP 4: Add device ID mapping in updateDeviceStatus() (around line 330)
 *   const deviceId = device === "water_pump" ? "water-pump" : ...
 * 
 * STEP 5: Add display name in formatDeviceName() (around line 420)
 *   case "water_pump":
 *       return "Water pump";
 * 
 * STEP 6: Add device card HTML in dashboard.html (see comments there)
 * 
 * IMPORTANT: Firebase path must match ESP32 code!
 *   Web app uses: "water_pump/state"
 *   ESP32 listens to: "/water_pump/state" (with leading slash)
 */
