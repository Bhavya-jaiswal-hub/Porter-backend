Porter Backend

A full-stack logistics backend powered by **Node.js**, **Express**, **MongoDB**, and **Razorpay**, supporting:

* User Authentication
* Vehicle Listings
* Booking System
* Payment Integration
* Real-time Delivery Tracking

---

## 🚀 Tech Stack

* **Node.js** + **Express** – API and server
* **MongoDB** – Database via Mongoose ODM
* **Razorpay** – Payment gateway integration
* **Socket.IO** – Simulated real-time tracking

---

## 📁 Project Structure

porter-backend/
├── routes/             # All API routes
├── models/             # Mongoose models
├── controllers/        # Route logic (optional modularity)
├── public/             # Static files for frontend
├── server.js           # Entry point with Socket.IO + Express
├── .env                # Environment variables


## 🛠 Setup Instructions

1. Clone the repo and install dependencies:


npm install

2. Add a `.env` file in root:

PORT=8080
MONGO_URI=mongodb+srv://<your-mongo-uri>
RAZORPAY_KEY_ID=rzp_test_XXXXX
RAZORPAY_SECRET=your_secret_key

3. Run in development:


npm run dev

## 📌 Notes

* Tracking is currently simulated. To use live tracking, integrate geolocation or driver input logic.
* You can serve static frontend from `/public` or use a separate frontend app.
