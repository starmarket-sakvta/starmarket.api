const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

// Initialize the app
const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
const mongoURI = 'mongodb+srv://zonegamer528:emq1AD1Uesqk6r2w@star.kihsh.mongodb.net/?retryWrites=true&w=majority&appName=star'; // Replace with your MongoDB URI
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Define Item Schema and Model
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  itemId: { type: String, required: true, unique: true },
  classId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  imageUrl: { type: String, required: true },
});

const Item = mongoose.model('Item', itemSchema);

// Publish item to market
app.post('/api/publish', async (req, res) => {
  const { steamId, itemId, classId, name, price, imageUrl } = req.body;

  try {
    // Check if item is already published
    const existingItem = await Item.findOne({ itemId });
    if (existingItem) {
      return res.status(400).json({ message: 'Item is already published.' });
    }

    // Add item to the market
    const newItem = new Item({ steamId, itemId, classId, name, price, imageUrl });
    await newItem.save();

    res.status(200).json({ message: 'Item published successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while publishing item.' });
  }
});

// Get all market items
app.get('/api/market', async (req, res) => {
  try {
    const items = await Item.find();
    res.status(200).json(items);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error while fetching market items.' });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
