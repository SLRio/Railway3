const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------
// Connect to MongoDB Atlas
// ---------------------------
mongoose
  .connect(
    'mongodb+srv://Rio:RioAstal1234@rio.kh2t4sq.mongodb.net/myDatabase?retryWrites=true&w=majority',
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// ---------------------------
// Helper Function for Date Formatting
// ---------------------------
function getFormattedDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);
  const hours = ("0" + d.getHours()).slice(-2);
  const minutes = ("0" + d.getMinutes()).slice(-2);
  const seconds = ("0" + d.getSeconds()).slice(-2);
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// ---------------------------
// Define Mongoose Schema and Model
// ---------------------------
// The schema now holds two types of sensor data:
// - Rainfall Level: saved as Gdate and Gvalue (from topic "Garbage")
// - Ammonia Gas Level: saved as Mdate and Mvalue (from topic "Methane")
const sensorDataSchema = new mongoose.Schema({
  Gdate: { type: String, default: null },
  Gvalue: { type: Number, default: null },
  Mdate: { type: String, default: null },
  Mvalue: { type: Number, default: null }
});

// Include a virtual "id" when converting to JSON
sensorDataSchema.set('toJSON', { virtuals: true });

const Record = mongoose.model('Record', sensorDataSchema);

// ---------------------------
// Middleware Setup
// ---------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Serve static files (e.g., home.html, Agraph.html, Acurd.html) from the current directory
app.use(express.static(__dirname));

// ---------------------------
// REST API Endpoints
// ---------------------------

/**
 * GET /data
 * Retrieves records from the database.
 * Use query parameter sensor=G for Rainfall data (Gdate, Gvalue)
 * or sensor=M for Ammonia Gas data (Mdate, Mvalue)
 */
app.get('/data', async (req, res) => {
  const sensor = req.query.sensor;
  let query = {};
  if (sensor === 'G') {
    query = { Gvalue: { $ne: null } };
  } else if (sensor === 'M') {
    query = { Mvalue: { $ne: null } };
  }
  try {
    const records = await Record.find(query);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /data
 * Creates a new record.
 * Expects JSON with appropriate fields:
 * For sensor "G": provide Gdate and Gvalue.
 * For sensor "M": provide Mdate and Mvalue.
 */
app.post('/data', async (req, res) => {
  const { Gvalue, Gdate, Mvalue, Mdate } = req.body;
  if ((Gvalue === undefined || !Gdate) && (Mvalue === undefined || !Mdate)) {
    return res.status(400).json({ error: 'Required sensor data missing.' });
  }
  try {
    const newRecord = new Record({ Gvalue, Gdate, Mvalue, Mdate });
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /data/:id
 * Updates an existing record.
 * Expects JSON with sensor data.
 */
app.put('/data/:id', async (req, res) => {
  const { Gvalue, Gdate, Mvalue, Mdate } = req.body;
  try {
    const updatedRecord = await Record.findByIdAndUpdate(
      req.params.id,
      { Gvalue, Gdate, Mvalue, Mdate },
      { new: true }
    );
    if (!updatedRecord) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    res.json(updatedRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /data/:id
 * Deletes a record by id.
 */
app.delete('/data/:id', async (req, res) => {
  try {
    const deletedRecord = await Record.findByIdAndDelete(req.params.id);
    if (!deletedRecord) {
      return res.status(404).json({ error: 'Record not found.' });
    }
    res.json(deletedRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /data/all
 * Deletes all records.
 * Optional: Use query parameter sensor=G or sensor=M to delete specific sensor data.
 */
app.delete('/data/all', async (req, res) => {
  const sensor = req.query.sensor;
  let query = {};
  if (sensor === 'G') {
    query = { Gvalue: { $ne: null } };
  } else if (sensor === 'M') {
    query = { Mvalue: { $ne: null } };
  }
  try {
    await Record.deleteMany(query);
    res.json({ message: 'Records deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error while deleting records.' });
  }
});

// ---------------------------
// Start the Express Server
// ---------------------------
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// ---------------------------
// MQTT Client Integration
// ---------------------------
const device_id = "Device0001";
const mqttServer = "broker.hivemq.com";
const mqttPort = 1883;
const mqttUser = "semini";
const mqttPassword = "Semini17";
const mqttClientId = "hivemq.webclient.1717873306472";

const mqttClient = mqtt.connect(`mqtt://${mqttServer}`, {
  port: mqttPort,
  username: mqttUser,
  password: mqttPassword,
  clientId: mqttClientId
});

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  // Subscribe to both topics:
  mqttClient.subscribe("Garbage", (err) => {
    if (err) {
      console.error('Error subscribing to topic "Garbage":', err);
    } else {
      console.log('Subscribed to topic: Garbage');
    }
  });
  mqttClient.subscribe("Methane", (err) => {
    if (err) {
      console.error('Error subscribing to topic "Methane":', err);
    } else {
      console.log('Subscribed to topic: Methane');
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  const value = parseFloat(message.toString());
  if (isNaN(value)) {
    console.error('Received invalid numeric value from MQTT:', message.toString());
    return;
  }
  
  // Use the formatted date
  const timestamp = getFormattedDate();
  
  try {
    if (topic === "Garbage") {
      // Save as Rainfall Level reading (Gdate, Gvalue)
      const newRecord = new Record({ Gdate: timestamp, Gvalue: value });
      await newRecord.save();
      console.log(`Device: ${device_id} - Saved Garbage record as Rainfall Level:`, newRecord);
    } else if (topic === "Methane") {
      // Save as Ammonia Gas Level reading (Mdate, Mvalue)
      const newRecord = new Record({ Mdate: timestamp, Mvalue: value });
      await newRecord.save();
      console.log(`Device: ${device_id} - Saved Methane record as Ammonia Gas Level:`, newRecord);
    } else {
      console.log(`Received message from unknown topic "${topic}":`, message.toString());
    }
  } catch (err) {
    console.error('Error saving record from MQTT message:', err);
  }
});
