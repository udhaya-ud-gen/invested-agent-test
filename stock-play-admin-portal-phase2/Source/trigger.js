exports = async function () {
  const serviceName = "Cluster-1";
  const dbName = "stock_play_admin";
  const collection = context.services.get(serviceName).db(dbName).collection("organizations");
  const now = new Date();

  const isExpired = (value) => {
    if (!value) return false;
    const raw = String(value).trim();
    if (!raw) return false;

    if (raw.includes("T") || raw.includes(" ")) {
      const dt = new Date(raw);
      return !Number.isNaN(dt.getTime()) && dt <= now;
    }

    const d = new Date(`${raw.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return false;
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return d <= todayUtc;
  };
  
  const orgs = await collection.find({}).toArray();
  const summary = { organizations_expired: 0, license_history_expired: 0, authorized_users_expired: 0, organizations_updated: 0 };

  for (const org of orgs) {
    let changed = false;
    let status = org.status || "Pending";

    if (status !== "Expired" && isExpired(org.expiryDate)) {
      status = "Expired";
      changed = true;
      summary.organizations_expired++;
    }

    const expiredIds = {};
    const expiredCodes = {};
    const licenseHistory = (org.licenseHistory || []).map((x) => {
      const item = { ...x };
      if (item.status !== "Expired" && isExpired(item.expiryDate)) {
        item.status = "Expired";
        changed = true;
        summary.license_history_expired++;
      }
      if (String(item.status || "").toLowerCase() === "expired") {
        if (item.id) expiredIds[String(item.id).trim()] = true;
        if (item.licenseCode) expiredCodes[String(item.licenseCode).trim().toUpperCase()] = true;
      }
      return item;
    });

    const authorizedUsers = (org.authorizedUsers || []).map((u) => {
      const user = { ...u };
      const lid = String(user.licenseId || "").trim();
      const lcode = String(user.licenseCode || "").trim().toUpperCase();
      const linkedExpired = (lid && expiredIds[lid]) || (lcode && expiredCodes[lcode]);

      if (user.status !== "Expired" && linkedExpired) {
        user.status = "Expired";
        changed = true;
        summary.authorized_users_expired++;
      }
      return user;
    });

    if (changed) {
      await collection.updateOne(
        { _id: org._id },
        { $set: { status, licenseHistory, authorizedUsers } }
      );
      summary.organizations_updated++;
    }
  }

  console.log("Expiry job summary:", JSON.stringify(summary));
  return { ok: true, summary };
};