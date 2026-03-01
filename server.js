require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS
  }
});

app.post('/razorpay-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(req.body);

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity;
    const notes = payment.notes || {};

    transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: `🏨 New Booking — ${notes['Room Type'] || 'Room'} — ₹${payment.amount / 100}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <div style="background:#2c3e2d;padding:20px;text-align:center;">
            <h1 style="color:#c9a84c;margin:0;">Hotel Sudarshan Nainital</h1>
            <p style="color:rgba(255,255,255,0.8);margin:5px 0 0;">New Booking Received!</p>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr style="background:#f7f3ec;">
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Booking ID</td>
                <td style="padding:10px;border:1px solid #e8dece;">${payment.id}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Guest Name</td>
                <td style="padding:10px;border:1px solid #e8dece;">${notes['Full Name'] || '-'}</td>
              </tr>
              <tr style="background:#f7f3ec;">
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Phone</td>
                <td style="padding:10px;border:1px solid #e8dece;">${notes['Phone Number'] || '-'}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Email</td>
                <td style="padding:10px;border:1px solid #e8dece;">${payment.email || '-'}</td>
              </tr>
              <tr style="background:#f7f3ec;">
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Room Type</td>
                <td style="padding:10px;border:1px solid #e8dece;">${notes['Room Type'] || '-'}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Check-in</td>
                <td style="padding:10px;border:1px solid #e8dece;">${notes['Check-in Date'] || '-'}</td>
              </tr>
              <tr style="background:#f7f3ec;">
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Check-out</td>
                <td style="padding:10px;border:1px solid #e8dece;">${notes['Check-out Date'] || '-'}</td>
              </tr>
              <tr>
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;">Amount Paid</td>
                <td style="padding:10px;border:1px solid #e8dece;font-weight:bold;color:#2c3e2d;">₹${payment.amount / 100}</td>
              </tr>
            </table>
          </div>
          <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
            Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
          </div>
        </div>
      `
    });
  }

  res.json({ status: 'ok' });
});

app.listen(3000, () => console.log("Server running!"));