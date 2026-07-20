const mongoose = require("mongoose");

const licenseSchema = new mongoose.Schema(
  {
    scopeId: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["active", "expired"],
      default: "expired",
      index: true
    },
    activatedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("License", licenseSchema);
