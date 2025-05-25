const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config(); // 🔹 энэ мөрийг хамгийн эхэнд нэм
const app = express();
app.use(bodyParser.json());
app.use(cors());

// MongoDB connection


const uri = process.env.MONGO_URI; // 🔐 URI-г .env-ээс авна

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
const orderSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  buyerId: { type: String, required: true },
  sellerId: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'canceled'], default: 'pending' },
  timestamp: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
app.post('/buy', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { buyerId, sellerId, itemId, price } = req.body;

    const buyer = await Balance.findOne({ steamId: buyerId }).session(session);
    const seller = await Balance.findOne({ steamId: sellerId }).session(session);
    const item = await Item.findOne({ assetId: itemId }).session(session);

    if (!buyer || !seller) throw new Error('User not found');
    if (!item) throw new Error('Item not found');
    if (buyer.balance < price) throw new Error('Insufficient balance');

    // 🔸 Худалдан авагчийн баланс хасах
    buyer.balance -= price;
    buyer.transactions.push({ type: 'purchase', amount: price, status: 'completed' });

    // 🔸 Худалдагчийн баланс нэмэх
    seller.balance += price;
    seller.transactions.push({ type: 'sale', amount: price, status: 'completed' });

    // 🔸 Item-ийг market-ээс устгах
    await Item.findOneAndUpdate(
  { assetId: itemId },
  { published: false },
  { session }
);

    // 🔸 Захиалгыг `orders` collection-д хадгалах
    const newOrder = new Order({
      itemId: itemId,
      buyerId: buyerId,
      sellerId: sellerId,
      price: price,
      status: 'pending', // Захиалга эхэлсэн төлөв
      timestamp: new Date()
    });

    await newOrder.save({ session });

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
app.get('/orders/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    const orders = await Order.find({ $or: [{ buyerId: steamId }, { sellerId: steamId }] });
    res.status(200).json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
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
// 🔒 User Schema (newly added)
const userSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true },
  tradeUrl: { type: String, default: "" },
  apiKey: { type: String, default: "" },
  email: { type: String, default: "" },
  bankAccount: { type: String, default: "" }
}, { timestamps: true }); // ⬅️ add this

const User = mongoose.model('User', userSchema);

// 🔹 Get user data
app.get('/user/:steamId', async (req, res) => {
  try {
    const user = await User.findOne({ steamId: req.params.steamId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching user data' });
  }
});

// 🔹 Update user data
app.put('/user/update', async (req, res) => {
  try {
    const { steamId, tradeUrl, apiKey, email, bankAccount } = req.body;
    if (!steamId) return res.status(400).json({ error: 'Steam ID required.' });

    // 🔍 зөвхөн ирсэн утгуудыг update-д оруулах
    const updateFields = {};
    if (tradeUrl !== undefined) updateFields.tradeUrl = tradeUrl;
    if (apiKey !== undefined) updateFields.apiKey = apiKey;
    if (email !== undefined) updateFields.email = email;
    if (bankAccount !== undefined) updateFields.bankAccount = bankAccount;

    const updatedUser = await User.findOneAndUpdate(
      { steamId },
      updateFields,
      { new: true, upsert: true }
    );

    res.status(200).json({ message: 'Updated successfully', user: updatedUser });
  } catch (err) {
    console.error('❌ Failed to update user:', err);
    res.status(500).json({ error: 'Failed to update user data.' });
  }
});

// Your existing endpoints (item, balance, deposit, withdraw, buy, etc.)

let cache = {};

app.get("/inventory/:steamId", async (req, res) => {
    try {
        const { steamId } = req.params;
        const url = `https://steamcommunity.com/inventory/${steamId}/730/2?l=english&count=5000&t=${Date.now()}`;
        
        // Хэрэглэгчийн inventory cache-д байгаа эсэхийг шалгана
        if (cache[steamId] && (Date.now() - cache[steamId].timestamp < 60000)) {
            return res.json(cache[steamId].data);
        }

        const response = await axios.get(url);
        cache[steamId] = { data: response.data, timestamp: Date.now() };
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch inventory" });
    }
});



app.post('/create_offer', async (req, res) => {
  const axios = require('axios');
  try {
    const { sellerId, buyerId, assetId } = req.body;

    // 1. User-уудын мэдээлэл авах
    const seller = await User.findOne({ steamId: sellerId });
    const buyer = await User.findOne({ steamId: buyerId });

    if (!seller || !buyer) {
      return res.status(404).json({ error: 'Seller or Buyer not found' });
    }

    // 2. Buyer-ийн tradeUrl-оос partner, token гаргаж авах
    const tradeUrl = buyer.tradeUrl;
    const urlObj = new URL(tradeUrl);
    const partner = urlObj.searchParams.get('partner');
    const token = urlObj.searchParams.get('token');

    if (!partner || !token) {
      return res.status(400).json({ error: 'Invalid trade URL' });
    }

    // 3. Offer үүсгэх payload
    const payload = {
      "partner": partner,
      "token": token,
      "items_to_give": [
        {
          "appid": 730,
          "contextid": "2",
          "assetid": assetId
        }
      ],
      "message": "Thanks for your purchase from StarMarket!",
    };

    // 4. Steam API руу хүсэлт илгээх
    const response = await axios.post(`https://api.steampowered.com/IEconService/SendTradeOffer/v1/`, null, {
      params: {
        key: seller.apiKey,
        trade_offer_access_token: token,
        partner: partner,
        json_tradeoffer: JSON.stringify({
          newversion: true,
          version: 2,
          me: {
            assets: [{
              appid: 730,
              contextid: "2",
              assetid: assetId
            }],
            currency: [],
            ready: false
          },
          them: {
            assets: [],
            currency: [],
            ready: false
          }
        }),
        message: payload.message
      }
    });

    // 5. Хариу илгээх
    if (response.data && response.data.response && response.data.response.tradeofferid) {
      return res.json({ success: true, tradeOfferId: response.data.response.tradeofferid });
    } else {
      return res.status(400).json({ success: false, error: 'Trade offer not created' });
    }

  } catch (err) {
    console.error('Trade offer creation failed:', err);
    res.status(500).json({ error: 'Server error creating trade offer' });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
