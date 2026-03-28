
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './db.js';
import { User, FoodPosting, ChatMessage, Notification } from './models.js';
import twilio from 'twilio';
import admin from 'firebase-admin';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

// Connect to Database
connectDB();

// Initialize Firebase Admin
try {
  const serviceAccount = JSON.parse(fs.readFileSync('./planning-with-ai-46ca2-firebase-adminsdk-fbsvc-8b5c0f992d.json', 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.log("Firebase Admin initialization failed. Ensure the JSON key file is present.");
}

// Initialize Twilio
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) 
  : null;

// --- TWILIO OTP ROUTES ---
app.post('/api/auth/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!twilioClient || !process.env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: "Twilio credentials not configured on server" });
  }
  try {
      const verification = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verifications.create({ to: phone, channel: 'sms' });
      res.json({ success: true, status: verification.status });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  const { phone, code, isLoginPhase } = req.body;
  if (!twilioClient || !process.env.TWILIO_VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: "Twilio credentials not configured on server" });
  }
  try {
      const verificationCheck = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks.create({ to: phone, code });

      if (verificationCheck.status !== 'approved') {
          return res.status(400).json({ error: 'Invalid OTP code' });
      }

      // If it's a login phrase, we need to issue a custom token for Firebase
      if (isLoginPhase) {
          // Find user by phone in MongoDB
          const allUsers = await User.find();
          const fPhone = phone.replace(/\D/g, '');
          const appUser = allUsers.find(u => {
              const uPhone = (u.contactNo || '').replace(/\D/g, '');
              return uPhone && fPhone.includes(uPhone);
          });

          if (!appUser) {
              return res.status(404).json({ error: 'Verification required. Please create an account to get verified.' });
          }

          // Mint Firebase Custom Token
          const customToken = await admin.auth().createCustomToken(appUser.id);
          return res.json({ success: true, customToken, user: appUser });
      }

      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

// --- USER ROUTES ---
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.params.id });
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { id: req.body.id }, 
      req.body, 
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { id: req.params.id }, 
      { $set: req.body }, 
      { new: true }
    );
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await User.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- POSTING ROUTES ---
app.get('/api/postings', async (req, res) => {
  try {
    const postings = await FoodPosting.find().sort({ createdAt: -1 });
    res.json(postings);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/postings', async (req, res) => {
  try {
    const posting = await FoodPosting.findOneAndUpdate(
      { id: req.body.id },
      req.body,
      { upsert: true, new: true }
    );
    res.json(posting);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/postings/:id', async (req, res) => {
  try {
    const posting = await FoodPosting.findOneAndUpdate(
      { id: req.params.id },
      { $set: req.body },
      { new: true }
    );
    res.json(posting);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/postings/:id', async (req, res) => {
  try {
    await FoodPosting.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- RATING ROUTES ---
app.post('/api/ratings', async (req, res) => {
  const { postingId, ratingData } = req.body;
  try {
    // 1. Update Posting
    const posting = await FoodPosting.findOne({ id: postingId });
    if (posting) {
      posting.ratings.push(ratingData);
      await posting.save();
    }

    // 2. Update User Stats
    const user = await User.findOne({ id: ratingData.targetId });
    if (user) {
      const count = user.ratingsCount || 0;
      const avg = user.averageRating || 0;
      const newCount = count + 1;
      const currentTotal = (count > 0) ? avg * count : 0;
      const newAvg = (currentTotal + ratingData.rating) / newCount;
      
      user.averageRating = newAvg;
      user.ratingsCount = newCount;
      await user.save();
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- MESSAGE ROUTES ---
app.get('/api/messages/:postingId', async (req, res) => {
  try {
    const messages = await ChatMessage.find({ postingId: req.params.postingId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages', async (req, res) => {
  try {
    const msg = await ChatMessage.create(req.body);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- NOTIFICATION ROUTES ---
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const notifs = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json(notifs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const notif = await Notification.create(req.body);
    res.json(notif);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
