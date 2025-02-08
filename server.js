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
// Define Mongoose Schema and Model
// ---------------------------
const recordSchema = new mongoose.Schema({
  value: Number,   // numeric sensor value
  date: String,    // timestamp (ISO format)
  topic: String    // MQTT topic (e.g., "Garbage", "Rainfall", etc.)
});

// Include virtual "id" when converting to JSON
recordSchema.set('toJSON', { virtuals: true });

const Record = mongoose.model('Record', recordSchema);

// ---------------------------
// Middleware Setup
// ---------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (graph.html, crud.html, home.html, Agraph.html, Acurd.html, etc.) from the current directory
app.use(express.static(__dirname));

// ---------------------------
// REST API Endpoints
// ---------------------------

/**
 * GET /data
 * Retrieves records from the database.
 * Optionally, filter by topic using ?topic=YourTopic
 */
app.get('/data', async (req, res) => {
  const topic = req.query.topic;
  let query = {};
  if (topic) {
    query.topic = topic;
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
 * Expects JSON with keys: value, date, and optionally topic.
 */
app.post('/data', async (req, res) => {
  const { value, date, topic } = req.body;
  if (value === undefined || !date) {
    return res.status(400).json({ error: 'Value and date are required.' });
  }
  try {
    const newRecord = new Record({ value: Number(value), date, topic: topic || '' });
    await newRecord.save();
    res.status(201).json(newRecord);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /data/:id
 * Updates an existing record by id.
 * Expects JSON with keys: value, date, and optionally topic.
 */
app.put('/data/:id', async (req, res) => {
  const { value, date, topic } = req.body;
  try {
    const updatedRecord = await Record.findByIdAndUpdate(
      req.params.id,
      { value: Number(value), date, topic: topic || '' },
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
 * Deletes a record by its id.
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
 * Optionally, filter by topic using ?topic=YourTopic.
 */
app.delete('/data/all', async (req, res) => {
  const topic = req.query.topic;
  let query = {};
  if (topic) {
    query.topic = topic;
  }
  try {
    await Record.deleteMany(query);
    res.json({ message: 'All records deleted successfully.' });
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

// Subscribe to the new topic "Garbage" for Ammonia Gas Level
const mqttTopic = "Garbage";

const mqttOptions = {
  port: mqttPort,
  username: mqttUser,
  password: mqttPassword,
  clientId: mqttClientId
};

const mqttBrokerUrl = `mqtt://${mqttServer}`;
const mqttClient = mqtt.connect(mqttBrokerUrl, mqttOptions);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe(mqttTopic, (err) => {
    if (err) {
      console.error(`Error subscribing to topic "${mqttTopic}":`, err);
    } else {
      console.log(`Subscribed to topic: ${mqttTopic}`);
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  const value = parseFloat(message.toString());
  if (isNaN(value)) {
    console.error('Received invalid numeric value from MQTT:', message.toString());
    return;
  }
  const timestamp = new Date().toISOString();
  try {
    // Save the record along with its topic
    const newRecord = new Record({ value, date: timestamp, topic });
    await newRecord.save();
    console.log(`Device: ${device_id} - Saved new record from MQTT topic "${topic}":`, newRecord);
  } catch (err) {
    console.error('Error saving record from MQTT message:', err);
  }
});
