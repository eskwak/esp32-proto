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

const firebaseConfig = {
    apiKey: "AIzaSyCw4KulOclsZXzoyWpqFH2bhdI88SZNstU",
    authDomain: "cat-automated-smart-home.firebaseapp.com",
    projectId: "cat-automated-smart-home",
    storageBucket: "cat-automated-smart-home.firebasestorage.app",
    messagingSenderId: "305184458497",
    appId: "1:305184458497:web:20f009e9b16ce9136b7d00",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const ESP32_IP_KEY = "esp32_ip_address";
let messageTimeout;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initAuthForms();
    initGoogleAuth();
    initSignOut();
    initDashboardNavigation();
    initDashboardControls();
});

onAuthStateChanged(auth, (user) => {
    const authCard = document.getElementById("authCard");
    const appSection = document.getElementById("appSection");
    const signOutBtn = document.getElementById("signOutBtn");
    const userEmail = document.getElementById("userEmail");
    const isDashboard = Boolean(document.getElementById("dashboardPage"));

    if (user) {
        authCard?.classList.add("hidden");
        appSection?.classList.remove("hidden");
        if (signOutBtn) signOutBtn.hidden = false;
        if (userEmail) userEmail.textContent = user.email ?? "User";
    } else {
        authCard?.classList.remove("hidden");
        appSection?.classList.add("hidden");
        if (signOutBtn) signOutBtn.hidden = true;
        if (userEmail) userEmail.textContent = "";
        if (isDashboard) {
            window.location.href = "./index.html";
        }
    }
});

function initTabs() {
    const tabs = $$(".tab");
    if (!tabs.length) return;

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");

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

function initAuthForms() {
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

function initDashboardNavigation() {
    const goDashboard = document.getElementById("goDashboard");
    if (!goDashboard) return;

    goDashboard.addEventListener("click", (event) => {
        event.preventDefault();
        window.location.href = "./dashboard.html";
    });
}

function initDashboardControls() {
    const ipInput = document.getElementById("esp32-ip");
    if (!ipInput) return;

    const savedIP = localStorage.getItem(ESP32_IP_KEY);
    if (savedIP) {
        ipInput.value = savedIP;
        refreshStatus();
    }

    ipInput.addEventListener("change", (event) => {
        const value = event.target.value.trim();
        localStorage.setItem(ESP32_IP_KEY, value);
    });
}

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

function showMessage(text, type) {
    const messageEl = document.getElementById("message");
    if (!messageEl) return;

    clearTimeout(messageTimeout);
    messageEl.textContent = text;
    messageEl.className = `status-message ${type}`;

    messageTimeout = window.setTimeout(() => {
        messageEl.textContent = "";
        messageEl.className = "status-message";
    }, 3000);
}

function clearFormMessage(element) {
    if (!element) return;
    element.textContent = "";
    element.className = "form-message";
}

function setFormMessage(element, text, type = "error") {
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${type}`;
}

async function controlDevice(device, action) {
    const ip = getESP32IP();
    if (!ip) return;

    const endpoint = device === "heating_pad" ? "26" : "27";
    const url = `http://${ip}/${endpoint}/${action}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === "success") {
            showMessage(`${formatDeviceName(device)} turned ${action}`, "success");
            updateDeviceStatus(device, data.state);
        } else {
            showMessage("Failed to control device", "error");
        }
    } catch (error) {
        console.error("Device control error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

async function refreshStatus() {
    const ip = getESP32IP();
    if (!ip) return;

    const url = `http://${ip}/status`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        updateDeviceStatus("heating_pad", data.heating_pad);
        updateDeviceStatus("temperature_sensor", data.temperature_sensor);

        showMessage("Status updated", "success");
    } catch (error) {
        console.error("Status refresh error:", error);
        showMessage(`Error: ${error.message}`, "error");
    }
}

function updateDeviceStatus(device, state) {
    const deviceId = device === "heating_pad" ? "heating-pad" : "temperature-sensor";
    const indicator = document.getElementById(`${deviceId}-indicator`);
    const statusText = document.getElementById(`${deviceId}-status`);

    if (!indicator || !statusText) return;

    const normalizedState = typeof state === "string" ? state.toLowerCase() : "unknown";
    indicator.className = `status-indicator ${normalizedState}`;
    statusText.textContent = `Status: ${normalizedState.toUpperCase()}`;
}

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

function formatDeviceName(device) {
    switch (device) {
        case "heating_pad":
            return "Heating pad";
        case "temperature_sensor":
            return "Temperature sensor";
        default:
            return device;
    }
}

window.controlDevice = controlDevice;
window.refreshStatus = refreshStatus;

