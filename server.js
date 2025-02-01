const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection string
const uri = "mongodb+srv://user2:Davaa123@star.kihsh.mongodb.net/?retryWrites=true&w=majority&appName=star";

mongoose
  .connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Failed to connect to MongoDB:', err));

// Define Item schema
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  item: { type: Object, required: true },
  price: { type: Number, required: true },
  published: { type: Boolean, default: false }, // Add published flag
});

const Item = mongoose.model('Item', itemSchema);

// Publish an item
app.post('/publish_item', async (req, res) => {
  try {
    const { steamId, name, imageUrl, item, price } = req.body;

    // Validate request
    if (!steamId || !name || !imageUrl || !item || !price) {
      return res.status(400).json({ error: 'All fields (steamId, name, imageUrl, item, price) are required.' });
    }

    const newItem = new Item({
      steamId,
      name,
      imageUrl,
      item,
      price,
      published: true, // Set published flag to true
    });

    await newItem.save();
    res.status(200).json({ message: 'Item published successfully.' });
  } catch (err) {
    console.error('Error publishing item:', err);
    res.status(500).json({ error: `Failed to publish item: ${err.message}` });
  }
});
app.put('/change_price/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { price } = req.body;

    const updatedItem = await Item.findByIdAndUpdate(
      itemId,
      { price },
      { new: true },
    );

    if (!updatedItem) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    res.status(200).json(updatedItem);
  } catch (err) {
    console.error('Error changing price:', err);
    res.status(500).json({ error: 'Failed to change price.' });
  }
});
app.delete('/delete_item/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;

    const deletedItem = await Item.findByIdAndDelete(itemId);

    if (!deletedItem) {
      return res.status(404).json({ error: 'Item not found.' });
    }

    res.status(200).json({ message: 'Item deleted successfully.' });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

// Get all market items
app.get('/market_items', async (req, res) => {
  try {
    const items = await Item.find();
    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching market items:', err);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
