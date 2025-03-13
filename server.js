const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection
const uri = "mongodb+srv://user2:Davaa123@star.kihsh.mongodb.net/?retryWrites=true&w=majority&appName=star";

mongoose
  .connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Failed to connect to MongoDB:', err));

// Item Schema
const itemSchema = new mongoose.Schema({
  steamId: { type: String, required: true },
  assetId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  price: { type: Number, required: true },
  published: { type: Boolean, default: true },
});

const Item = mongoose.model('Item', itemSchema);

const balanceSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
});

const transactionSchema = new mongoose.Schema({
  type: { type: String, enum: ['deposit', 'withdrawal', 'purchase', 'sale'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' },
  timestamp: { type: Date, default: Date.now }
});

const balanceSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  transactions: [transactionSchema] // New field to track transactions
});

const Balance = mongoose.model('Balance', balanceSchema);


// Publish an item: Only publish if it doesn't already exist.
app.post('/publish_item', async (req, res) => {
  try {
    const { steamId, assetId, name, imageUrl, price } = req.body;
    if (!steamId || !assetId || !name || !imageUrl || isNaN(price) || price <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid or missing fields.' });
    }
    const existingItem = await Item.findOne({ assetId });
    if (existingItem) {
      return res.status(400).json({ success: false, message: 'Item is already published.' });
    }
    const newItem = new Item({ steamId, assetId, name, imageUrl, price, published: true });
    await newItem.save();
    res.status(200).json({ success: true, message: 'Item published successfully.' });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ success: false, message: 'Failed to publish item.' });
  }
});

// Change price of an item
app.put('/change_price/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    const { price } = req.body;
    const updatedItem = await Item.findOneAndUpdate(
      { assetId },
      { price },
      { new: true }
    );
    if (!updatedItem)
      return res.status(404).json({ error: 'Item not found.' });
    res.status(200).json(updatedItem);
  } catch (err) {
    console.error('Change price error:', err);
    res.status(500).json({ error: 'Failed to change price.' });
  }
});

// Remove an item
app.delete('/remove_item/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    const deletedItem = await Item.findOneAndDelete({ assetId });
    if (!deletedItem) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    res.status(200).json({ message: 'Item removed successfully.' });
  } catch (err) {
    console.error('Error removing item:', err);
    res.status(500).json({ error: 'Failed to remove item.' });
  }
});

app.post('/buy', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { buyerId, sellerId, itemId, price } = req.body;

    const buyer = await Balance.findOne({ steamId: buyerId }).session(session);
    const seller = await Balance.findOne({ steamId: sellerId }).session(session);

    if (!buyer || !seller) throw new Error('User not found');
    if (buyer.balance < price) throw new Error('Insufficient balance');

    // 🔸 Deduct from buyer
    buyer.balance -= price;
    buyer.transactions.push({ type: 'purchase', amount: price, status: 'completed' });

    // 🔸 Add to seller
    seller.balance += price;
    seller.transactions.push({ type: 'sale', amount: price, status: 'completed' });

    await buyer.save({ session });
    await seller.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Purchase successful', buyerBalance: buyer.balance, sellerBalance: seller.balance });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ error: error.message });
  }
});


// Get selling (i.e. published) items for a specific user.
app.get('/selling_items/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    // Return only published items
    const items = await Item.find({ steamId, published: true });
    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching selling items:', err);
    res.status(500).json({ error: 'Failed to fetch selling items.' });
  }
});

// Get all market items
app.get('/market_items', async (req, res) => {
  try {
    const items = await Item.find({ published: true });
    res.status(200).json(items);
  } catch (err) {
    console.error('Error fetching market items:', err);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

// 🔹 Secure Deposit Money (Manual for Now)
app.post('/deposit', async (req, res) => {
  try {
    const { steamId, amount } = req.body;
    if (!steamId || amount <= 0) return res.status(400).json({ error: 'Invalid deposit amount' });

    const userBalance = await Balance.findOneAndUpdate(
      { steamId },
      { $inc: { balance: amount }, $push: { transactions: { type: 'deposit', amount, status: 'completed' } } },
      { new: true, upsert: true }
    );

    res.status(200).json({ message: 'Deposit successful', balance: userBalance.balance });
  } catch (err) {
    res.status(500).json({ error: 'Deposit failed' });
  }
});

// 🔹 Secure Withdrawal Request (Manual for Now)
app.post('/withdraw', async (req, res) => {
  try {
    const { steamId, amount } = req.body;
    if (!steamId || amount <= 0) return res.status(400).json({ error: 'Invalid withdrawal amount' });

    const userBalance = await Balance.findOne({ steamId });
    if (!userBalance || userBalance.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    // Deduct balance but mark transaction as "pending" for manual approval
    userBalance.balance -= amount;
    userBalance.transactions.push({ type: 'withdrawal', amount, status: 'pending' });

    await userBalance.save();
    res.status(200).json({ message: 'Withdrawal requested', balance: userBalance.balance });
  } catch (err) {
    res.status(500).json({ error: 'Withdrawal failed' });
  }
});


app.get('/balance/:steamId', async (req, res) => {
  try {
    const userBalance = await Balance.findOne({ steamId: req.params.steamId });
    if (!userBalance) return res.status(404).json({ error: 'User not found' });

    res.json({ balance: userBalance.balance, transactions: userBalance.transactions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve balance.' });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
