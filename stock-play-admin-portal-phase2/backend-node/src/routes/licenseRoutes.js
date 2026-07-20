const express = require("express");
const { expireLicensesInsideOrganizations } = require("../jobs/licenseExpiryJob");

const router = express.Router();

const parseDateOnly = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  const normalized = direct ? direct[1] : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const isActive = (license) => {
  const status = String(license?.status || "").trim().toLowerCase();
  if (status !== "active") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = parseDateOnly(license?.expiryDate);
  if (!expiry) return false;
  return expiry >= today;
};

router.get("/:scopeId/status", async (_req, res) => {
  const db = require("mongoose").connection.db;
  const organizations = await db.collection("organizations")
    .find({ licenseHistory: { $exists: true, $ne: [] } }, { projection: { licenseHistory: 1 } })
    .toArray();

  const activeLicenses = organizations.flatMap((org) =>
    (org.licenseHistory || []).filter(isActive)
  );

  return res.json({
    scopeId: "admin-portal",
    status: activeLicenses.length > 0 ? "active" : "expired",
    activeLicenseCount: activeLicenses.length
  });
});

router.post("/sync-expired", async (_req, res) => {
  const result = await expireLicensesInsideOrganizations();
  return res.json({ message: "Sync completed", ...result });
});

module.exports = router;
