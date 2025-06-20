// models/SteamSession.js
const mongoose = require("mongoose");

const steamSessionSchema = new mongoose.Schema({
  steamId: { type: String, required: true, unique: true },
  sessionid: { type: String, required: true },
  steamLogin: { type: String, required: true },
  steamLoginSecure: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SteamSession", steamSessionSchema);
