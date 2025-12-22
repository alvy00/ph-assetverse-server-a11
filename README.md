# AssetVerse Server ⚙️

**Backend API for Corporate Asset Management System**

This repository contains the backend server for **AssetVerse**, a B2B HR & Asset Management platform.  
It provides secure APIs for authentication, asset management, employee-company relationships, payments, and reporting.

---

## 🔗 Live API URL

`https://ph-assetverse-server-a11.onrender.com`

---

## 🎯 Purpose

The AssetVerse backend is responsible for:

-   Managing company assets and employee assignments
-   Handling authentication and authorization
-   Storing and retrieving data from MongoDB
-   Integrating payment systems (Stripe)
-   Ensuring secure communication between client and server

---

## 🧠 System Responsibilities

-   HR company management
-   Employee registration & company affiliation
-   Asset lifecycle tracking (inventory → assigned → returned)
-   Multi-company employee support
-   Subscription & payment handling
-   Secure API access

---

## 🛠️ Tech Stack

-   **Node.js**
-   **Express.js**
-   **MongoDB**
-   **Firebase Admin SDK**
-   **Stripe**
-   **dotenv**
-   **CORS**

---

## 📦 npm Packages Used

### Core Dependencies

-   `express` – REST API framework
-   `mongodb` – Database driver
-   `firebase-admin` – Secure authentication & admin access
-   `firebase` – Firebase services
-   `stripe` – Payment processing
-   `cors` – Cross-origin resource sharing
-   `dotenv` – Environment variable management

### Development Tools

-   `nodemon` – Auto-reload during development

---

## ⚙️ Setup Instructions

### 1️⃣ Clone the Repository

````bash
git clone https://github.com/alvy00/ph-assetverse-server-a11
cd ph-assetverse-server-a11

### 2️⃣ Install Dependencies
npm install

### 3️⃣ Run the Server (Development)
npm run dev

### 4️⃣ Run the Server (Production)
npm start

```bash

🔐 Environment Variables Configuration (Backend)

Create a .env file in the root of the server project:

PORT=4000
SITE_DOMAIN=https://ph-assetverse-client-a11.netlify.app/

DB_USER=your_database_username
DB_PASS=your_database_password

PAYMENT_GATEWAY=your_stripe_secret_key

FB_SERVICE_KEY=your_firebase_service_account_json
````
