# Excel Import Guide

## 📋 **How to Import Users from Excel**

### **For Portal Users (Users Page)**

1. **Click the "Import" button** on the Users page
2. **Select your Excel file** (.xls or .xlsx)
3. **Excel file must have these columns:**

| Name | Email | Password | Role | Status | Created Date |
|------|-------|----------|------|--------|--------------|
| John Doe | john@example.com | john123 | Super Admin | Active | 2026-02-11 |
| Jane Smith | jane@example.com | jane123 | Sales Admin | Active | 2026-02-11 |
| Bob Wilson | bob@example.com | bob123 | Super Admin | Pending | 2026-02-11 |nbvcxz 

**Column Details:**
- **Name** (Required): Full name
- **Email** (Required): Email address (must be unique)
- **Password** (Optional): Default is "default123" if not provided
- **Role** (Optional): "Super Admin" or "Sales Admin" (default: "Super Admin")
- **Status** (Optional): "Active", "Inactive", "Pending", or "Expired" (default: "Active")
- **Created Date** (Optional): Format: YYYY-MM-DD (default: today)

---

### **For Authorized Users (Organization Details → Authorized Users Tab)**

1. **Navigate to Organization Details**
2. **Click "Authorized Users" tab**
3. **Click the "Import" button**
4. **Select your Excel file** (.xls or .xlsx)
5. **Excel file must have these columns:**

| Name | Email | Created Date | Expiry Date | Status |
|------|-------|--------------|-------------|--------|
| Alice Johnson | alice@company.com | 2026-01-15 | 2027-01-15 | Active |
| Mark Davis | mark@company.com | 2026-01-20 | 2027-01-20 | Pending |
| Sarah Lee | sarah@company.com | 2026-02-01 | 2027-02-01 | Active |

**Column Details:**
- **Name** (Required): Full name
- **Email** (Required): Email address
- **Created Date** (Optional): Format: YYYY-MM-DD (default: today)
- **Expiry Date** (Optional): Format: YYYY-MM-DD 
- **Status** (Optional): "Active", "Pending", "Inactive", or "Expired" (default: "Pending")

---

## ✅ **Important Notes:**

1. **Column names are case-insensitive**
   - "Name", "name", and "NAME" all work
   - "Email", "email", and "EMAIL" all work

2. **Minimum required columns:**
   - Portal Users: **Name** and **Email**
   - Authorized Users: **Name** and **Email**

3. **File formats supported:**
   - `.xlsx` (Excel 2007+)
   - `.xls` (Excel 97-2003)

4. **Empty rows are ignored**

5. **Invalid rows are skipped**
   - Rows without name or email are automatically skipped
   - Valid rows are still imported

6. **Passwords are automatically hashed**
   - All imported passwords are securely hashed with bcrypt
   - Users can login immediately after import

---

## 🚨 **Troubleshooting:**

**"Excel file is empty"**
→ Make sure your sheet has data starting from row 2 (row 1 should be headers)

**"No valid users found"**
→ Ensure at least Name and Email columns exist and have data

**"Please upload an Excel file"**
→ File must end with .xls or .xlsx extension

**"Error reading Excel file"**
→ File may be corrupted. Try opening it in Excel and saving again

---

## 📝 **Sample Excel Templates:**

### **Template 1: Portal Users (Minimal)**
```
Name               | Email
-------------------|------------------
John Doe          | john@example.com
Jane Smith        | jane@example.com
```

### **Template 2: Portal Users (Complete)**
```
Name        | Email              | Password  | Role        | Status | Created Date
------------|--------------------|-----------| ------------|--------|-------------
John Doe    | john@example.com   | john123   | Super Admin| Active | 2026-02-11
Jane Smith  | jane@example.com   | jane456   | Sales Admin| Active | 2026-02-11
Bob Wilson  | bob@example.com    | bob789    | Super Admin| Pending| 2026-02-10
```

### **Template 3: Authorized Users**
```
Name          | Email                | Created Date | Expiry Date | Status
--------------|----------------------|--------------|-------------|--------
Alice Johnson | alice@company.com    | 2026-01-15   | 2027-01-15  | Active
Mark Davis    | mark@company.com     | 2026-01-20   | 2027-01-20  | Pending
Sarah Lee     | sarah@company.com    | 2026-02-01   | 2027-02-01  | Active
```

---

## 🎯 **Tips for Best Results:**

1. **Use the first row for column headers**
2. **Start data from the second row**
3. **Don't leave empty columns between data**
4. **Use consistent date formats (YYYY-MM-DD)**
5. **Test with a small file first (2-3 users)**
6. **Keep a backup of your data**

---

## 🔐 **Security Notes:**

- All imported passwords are **automatically hashed with bcrypt**
- Passwords are **never stored in plain text**
- Users can login immediately after import
- If no password is provided, default password "default123" is used
- Recommend users change their password after first login
