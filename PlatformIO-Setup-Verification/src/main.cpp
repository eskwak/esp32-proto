#include <Arduino.h>
#include <WiFi.h>

// Realtime database url from firebase (DO NOT CHANGE)
#define REALTIME_DATABASE_URL = "https://cat-automated-smart-home-default-rtdb.firebaseio.com/"

// Network credentials
const char* SSID = "Eddie";
const char* PASSWORD = "Eddiek1102!";

// Initialize web server port
WiFiServer server(80);

// Variable to store HTTP request
String http_request;

// Pin for test LEDs
const int HEATING_PAD_PIN = 5;
const int TEMPERATURE_SENSOR_PIN = 18;

// String variables to store test LED output states
String heating_pad_state = "off";
String temperature_sensor_state = "off";

// Current time
unsigned long current_time = millis();

// Previous time
unsigned long previous_time = 0;

// Timeout time in milliseconds (change this later when done testing)
const long timeout_time = 2000;

void setup(void) {
  Serial.begin(115200);

  pinMode(HEATING_PAD_PIN, OUTPUT);
  pinMode(TEMPERATURE_SENSOR_PIN, OUTPUT);

  digitalWrite(HEATING_PAD_PIN, LOW);
  digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);
  delay(100);

  // Wifi connection setup
  Serial.print("Connecting to ");
  Serial.println(SSID);
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("Wifi connection successful.");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  server.begin();
  delay(100);
}

void loop(){
  WiFiClient client = server.available();   // Listen for incoming clients

  if (client) {                             // If a new client connects,
    current_time = millis();
    previous_time = current_time;
    Serial.println("New Client.");          // print a message out in the serial port
    String currentLine = "";                // make a String to hold incoming data from the client
    while (client.connected() && current_time - previous_time <= timeout_time) {  // loop while the client's connected
      current_time = millis();
      if (client.available()) {             // if there's bytes to read from the client,
        char c = client.read();             // read a byte, then
        Serial.write(c);                    // print it out the serial monitor
        http_request += c;
        if (c == '\n') {                    // if the byte is a newline character
          // if the current line is blank, you got two newline characters in a row.
          // that's the end of the client HTTP request, so send a response:
          if (currentLine.length() == 0) {
            // Handle API endpoints and return JSON responses
            String response = "";
            bool handled = false;
            
            // turns the GPIOs on and off
            if (http_request.indexOf("GET /26/on") >= 0) {
              Serial.println("Heating Pad on");
              heating_pad_state = "on";
              digitalWrite(HEATING_PAD_PIN, HIGH);
              response = "{\"status\":\"success\",\"device\":\"heating_pad\",\"state\":\"on\"}";
              handled = true;
            } else if (http_request.indexOf("GET /26/off") >= 0) {
              Serial.println("Heating Pad off");
              heating_pad_state = "off";
              digitalWrite(HEATING_PAD_PIN, LOW);
              response = "{\"status\":\"success\",\"device\":\"heating_pad\",\"state\":\"off\"}";
              handled = true;
            } else if (http_request.indexOf("GET /27/on") >= 0) {
              Serial.println("Temperature Sensor on");
              temperature_sensor_state = "on";
              digitalWrite(TEMPERATURE_SENSOR_PIN, HIGH);
              response = "{\"status\":\"success\",\"device\":\"temperature_sensor\",\"state\":\"on\"}";
              handled = true;
            } else if (http_request.indexOf("GET /27/off") >= 0) {
              Serial.println("Temperature Sensor off");
              temperature_sensor_state = "off";
              digitalWrite(TEMPERATURE_SENSOR_PIN, LOW);
              response = "{\"status\":\"success\",\"device\":\"temperature_sensor\",\"state\":\"off\"}";
              handled = true;
            } else if (http_request.indexOf("GET /status") >= 0) {
              // Return current status of all devices
              response = "{\"heating_pad\":\"" + heating_pad_state + "\",\"temperature_sensor\":\"" + temperature_sensor_state + "\"}";
              handled = true;
            }
            
            // Send HTTP response
            if (handled) {
              client.println("HTTP/1.1 200 OK");
              client.println("Content-type:application/json");
              client.println("Access-Control-Allow-Origin: *");
              client.println("Connection: close");
              client.println();
              client.println(response);
            } else {
              client.println("HTTP/1.1 404 Not Found");
              client.println("Content-type:application/json");
              client.println("Connection: close");
              client.println();
              client.println("{\"status\":\"error\",\"message\":\"Endpoint not found\"}");
            }
            
            // Break out of the while loop
            break;
          } else { // if you got a newline, then clear currentLine
            currentLine = "";
          }
        } else if (c != '\r') {  // if you got anything else but a carriage return character,
          currentLine += c;      // add it to the end of the currentLine
        }
      }
    }
    // Clear the header variable
    http_request = "";
    // Close the connection
    client.stop();
    Serial.println("Client disconnected.");
    Serial.println("");
  }
}