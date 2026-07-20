const cron = require("node-cron");
const mongoose = require("mongoose");

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

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

async function expireLicensesInsideOrganizations() {
  const organizations = mongoose.connection.db.collection("organizations");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cursor = organizations.find(
    { licenseHistory: { $exists: true, $ne: [] } },
    { projection: { licenseHistory: 1 } }
  );

  let touchedDocs = 0;
  let touchedLicenses = 0;

  while (await cursor.hasNext()) {
    const org = await cursor.next();
    const list = Array.isArray(org.licenseHistory) ? org.licenseHistory : [];
    let changedInDoc = false;

    const updatedList = list.map((license) => {
      const expiryDate = parseDateOnly(license?.expiryDate);
      const isExpiredDate = expiryDate ? expiryDate < today : false;
      const isAlreadyExpired = normalizeStatus(license?.status) === "expired";

      if (isExpiredDate && !isAlreadyExpired) {
        changedInDoc = true;
        touchedLicenses += 1;
        return {
          ...license,
          status: "Expired"
        };
      }

      return license;
    });

    if (changedInDoc) {
      touchedDocs += 1;
      await organizations.updateOne(
        { _id: org._id },
        {
          $set: {
            licenseHistory: updatedList,
            updatedAt: new Date()
          }
        }
      );
    }
  }

  return { touchedDocs, touchedLicenses };
}

function startLicenseExpiryJob() {
  cron.schedule("* * * * *", async () => {
    try {
      const result = await expireLicensesInsideOrganizations();
      if (result.touchedLicenses > 0) {
        console.log(`[license-cron] Expired ${result.touchedLicenses} licenseHistory entries in ${result.touchedDocs} organization(s).`);
      }
    } catch (error) {
      console.error("[license-cron] Failed organization license expiry sync:", error.message);
    }
  });
}

module.exports = {
  startLicenseExpiryJob,
  expireLicensesInsideOrganizations
};
