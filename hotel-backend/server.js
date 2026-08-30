require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const Redis = require("ioredis");
const kv = new Redis(process.env.REDIS_URL);

const app = express();

// Prices are kept on the server. Never trust the amount sent by a browser.
const roomPrices = {
  "Double Bed": parseInt(process.env.PRICE_STANDARD, 10) || 3000,
  "Triple Non View": parseInt(process.env.PRICE_SEMI_DELUXE, 10) || 3800,
  "Triple With View": parseInt(process.env.PRICE_DELUXE, 10) || 4800,
  "Family (Lake/Mountain View)": parseInt(process.env.PRICE_SUITE, 10) || 6500,
};
const processedPayments = new Set();
const DIRECT_BOOKING_DISCOUNT = 0.10;

// ── Gmail Transporter ────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// ── Google Sheets: Append Row ────────────────────────────────
async function appendToGoogleSheet(booking) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const row = [
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      booking.paymentId,
      booking.name,
      booking.phone,
      booking.email,
      booking.roomType,
      booking.checkIn,
      booking.checkOut,
      booking.guests,
      booking.specialRequests,
      `₹${booking.amount}`,
      "Paid",
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Bookings!A:L",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });

    console.log("✅ Google Sheet updated!");
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message);
  }
}

// ── Email: Owner Notification ────────────────────────────────
function ownerEmailHTML(b) {
  const row = (bg, label, value) => `
    <tr style="background:${bg};">
      <td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">${label}</td>
      <td style="padding:10px 12px;border:1px solid #e8dece;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:24px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:22px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;">🎉 New Booking Received!</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("#f7f3ec", "Booking ID", b.paymentId)}
          ${row("#ffffff", "Guest Name", b.name || "—")}
          ${row("#f7f3ec", "Phone", b.phone || "—")}
          ${row("#ffffff", "Email", b.email || "—")}
          ${row("#f7f3ec", "Room Type", b.roomType || "—")}
          ${row("#ffffff", "Check-in", b.checkIn || "—")}
          ${row("#f7f3ec", "Check-out", b.checkOut || "—")}
          ${row("#ffffff", "No. of Guests", b.guests || "—")}
          ${row("#f7f3ec", "Special Requests", b.specialRequests || "None")}
          ${row("#ffffff", "Amount Paid", `<strong style="color:#2c3e2d;font-size:16px;">₹${b.amount}</strong>`)}
        </table>
      </div>
      <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
      </div>
    </div>`;
}

// ── Email: Guest Confirmation ────────────────────────────────
function guestEmailHTML(b) {
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;color:#6b6b5a;width:140px;">${label}</td>
      <td style="padding:6px 0;font-weight:600;color:#2c3e2d;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:28px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:24px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Booking Confirmed ✅</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:15px;color:#3a3a2e;margin-bottom:20px;">
          Dear <strong>${b.name || "Guest"}</strong>,<br><br>
          Thank you for choosing <strong>Hotel Sudarshan Nainital</strong>!
          Your booking is confirmed and payment received. We look forward to welcoming you.
        </p>
        <div style="background:#f7f3ec;border-left:4px solid #c9a84c;padding:16px 20px;border-radius:4px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;color:#6b6b5a;text-transform:uppercase;letter-spacing:.06em;">Booking Summary</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Booking ID", b.paymentId)}
            ${row("Room Type", b.roomType || "—")}
            ${row("Check-in", b.checkIn || "—")}
            ${row("Check-out", b.checkOut || "—")}
            ${row("No. of Guests", b.guests || "—")}
            ${row("Amount Paid", `₹${b.amount}`)}
          </table>
        </div>
        <div style="background:#2c3e2d;border-radius:6px;padding:16px 20px;color:#fff;">
          <p style="margin:0 0 8px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:.06em;">Hotel Contact</p>
          <p style="margin:3px 0;font-size:13px;">📍 Zoo Road, Tallital, Nainital – 263001, Uttarakhand</p>
          <p style="margin:3px 0;font-size:13px;">💬 WhatsApp +91 92864 48739</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
          <p style="margin:8px 0 0;font-size:13px;">🕐 Check-in from 12:00 PM &nbsp;|&nbsp; Check-out by 10:00 AM</p>
        </div>
        <p style="font-size:13px;color:#6b6b5a;margin-top:20px;line-height:1.6;">
          For any questions, please contact us on WhatsApp.
        </p>
        <p style="font-size:14px;color:#2c3e2d;margin-top:4px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
      </div>
    </div>`;
}

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  "https://hotelsudarshannainital.com",
  "https://www.hotelsudarshannainital.com",
  "https://hotelsudarshannainital.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8080",
  "http://127.0.0.1:8080"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Webhook route (defined before the JSON parser) ──────────
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  if (!secret || !signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).send("Webhook is not configured correctly");
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.warn("⚠️  Invalid signature");
    return res.status(400).send("Invalid signature");
  }

  const event = JSON.parse(req.body);
  console.log("📩 Event received:", event.event);

  // A payment.authorized event is not proof that the money was captured.
  // Payment Link bookings are confirmed only after payment_link.paid.
  if (event.event === "payment_link.paid") {
    const paymentLink = event.payload?.payment_link?.entity || {};
    const payment = event.payload?.payment?.entity || {};
    const customer = paymentLink.customer || {};
    const notes = paymentLink.notes || payment.notes || {};

    const booking = {
      paymentId: payment.id || paymentLink.id || "N/A",
      name: customer.name || notes["name"] || notes["Name"] || notes["Full Name"] || "—",
      phone: customer.contact || notes["phone"] || notes["Phone"] || notes["Phone Number"] || "—",
      email: customer.email || payment.email || "—",
      roomType: notes["room_type"] || notes["Room Type"] || notes["room type"] || paymentLink.description || "—",
      checkIn: notes["check_in_date"] || notes["Check In date"] || notes["Check-in Date"] || notes["checkin"] || "—",
      checkOut: notes["check_out_date"] || notes["Check Out Date"] || notes["Check-out Date"] || notes["checkout"] || "—",
      guests: notes["number_of_guest"] || notes["Number Of Guest"] || notes["Number of Guest"] || notes["guest"] || "—",
      specialRequests: notes["special_requests"] || notes["Special Requests"] || "—",
      amount: (payment.amount || paymentLink.amount || 0) / 100,
    };

    // Razorpay may retry a webhook. Do not send duplicate emails or rows.
    const paymentKey = booking.paymentId;
    if (processedPayments.has(paymentKey)) return res.json({ status: "already processed" });
    processedPayments.add(paymentKey);

    console.log("📋 Booking:", booking);

    // 1. Owner email
    try {
      await transporter.sendMail({
        from: `"Hotel Sudarshan" <${process.env.GMAIL_USER}>`,
        to: process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
        replyTo: `"${booking.name}" <${booking.email}>`,
        subject: `🏨 New Booking — ${booking.roomType} — ₹${booking.amount}`,
        html: ownerEmailHTML(booking),
      });
      console.log("✅ Owner email sent");
    } catch (err) {
      console.error("❌ Owner email error:", err.message);
    }

    // 2. Guest confirmation email
    if (booking.email && booking.email !== "—") {
      try {
        await transporter.sendMail({
          from: `"Hotel Sudarshan Nainital" <${process.env.GMAIL_USER}>`,
          to: booking.email,
          subject: `✅ Booking Confirmed — Hotel Sudarshan Nainital`,
          html: guestEmailHTML(booking),
        });
        console.log("✅ Guest email sent to:", booking.email);
      } catch (err) {
        console.error("❌ Guest email error:", err.message);
      }
    }

    // 3. Google Sheets
    await appendToGoogleSheet(booking);
  }

  res.json({ status: "ok" });
});

// ── JSON middleware (defined after the webhook) ─────────────
app.use(express.json());

// ── Vercel KV Pending Bookings Store ─────────────────────────
// Replaced in-memory Map with @vercel/kv
// IMPORTANT: Add BACKEND_URL=https://your-backend-url.com to your .env file

// ── Email: Owner Approval Request ────────────────────────────
function ownerApprovalEmailHTML(b, approveUrl, disapproveUrl) {
  const row = (bg, label, value) => `
    <tr style="background:${bg};">
      <td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">${label}</td>
      <td style="padding:10px 12px;border:1px solid #e8dece;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:24px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:22px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;">🔔 New Booking Request — Approval Required</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#3a3a2e;margin-bottom:16px;">
          A new booking request has been received. Please review the details below and click <strong>Approve</strong> to confirm.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("#f7f3ec", "Guest Name", b.name || "—")}
          ${row("#ffffff", "Phone", b.phone || "—")}
          ${row("#f7f3ec", "Email", b.email || "—")}
          ${row("#ffffff", "Room Type", b.roomType || "—")}
          ${row("#f7f3ec", "Check-in", b.checkIn || "—")}
          ${row("#ffffff", "Check-out", b.checkOut || "—")}
          ${row("#f7f3ec", "No. of Guests", b.guests || "—")}
          ${row("#ffffff", "Special Requests", b.specialRequests || "None")}
          ${row("#f7f3ec", "Vehicle Parking", b.parking || "Not specified")}
          ${row("#ffffff", "Total Amount", `<strong style="color:#2c3e2d;font-size:16px;">₹${b.amount}</strong>`)}
        </table>
        <div style="text-align:center;margin-top:28px;">
          <a href="${approveUrl}"
             style="display:inline-block;background:#c9a84c;color:#1a2218;padding:14px 36px;border-radius:6px;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.05em;">
            ✅ Approve &amp; Send Payment Link
          </a>
        </div>
        <div style="text-align:center;margin-top:14px;">
          <a href="${disapproveUrl}"
             style="display:inline-block;background:#8b1a1a;color:#ffffff;padding:14px 36px;border-radius:6px;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.05em;">
            ❌ Disapprove &amp; Notify Guest
          </a>
        </div>
        <p style="font-size:12px;color:#999;margin-top:16px;text-align:center;">
          These links are valid for 48 hours.
        </p>
      </div>
      <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
      </div>
    </div>`;
}

// ── Email: Guest — Payment Link ───────────────────────────────
function guestPaymentEmailHTML(b, paymentUrl) {
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;color:#6b6b5a;width:140px;">${label}</td>
      <td style="padding:6px 0;font-weight:600;color:#2c3e2d;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:28px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:24px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">🎉 Your Booking is Approved!</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:15px;color:#3a3a2e;margin-bottom:20px;">
          Dear <strong>${b.name || "Guest"}</strong>,<br><br>
          Great news! Your booking request at <strong>Hotel Sudarshan Nainital</strong> has been <strong>approved</strong>.
          Please complete your payment using the button below to confirm your reservation.
        </p>
        <div style="background:#f7f3ec;border-left:4px solid #c9a84c;padding:16px 20px;border-radius:4px;margin-bottom:24px;">
          <p style="margin:0 0 10px;font-size:13px;color:#6b6b5a;text-transform:uppercase;letter-spacing:.06em;">Booking Summary</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Room Type", b.roomType || "—")}
            ${row("Check-in", b.checkIn || "—")}
            ${row("Check-out", b.checkOut || "—")}
            ${row("No. of Guests", b.guests || "—")}
            ${row("Amount Due", `<span style="color:#c9a84c;font-size:16px;font-weight:700;">₹${b.amount}</span>`)}
          </table>
        </div>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${paymentUrl}"
             style="display:inline-block;background:#c9a84c;color:#1a2218;padding:14px 36px;border-radius:6px;font-size:16px;font-weight:700;text-decoration:none;letter-spacing:0.05em;">
            💳 Pay Now — ₹${b.amount}
          </a>
        </div>
        <div style="background:#fff8e1;border-left:4px solid #f5c842;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:13px;color:#6b4c00;">
          ⏳ This payment link is valid for <strong>24 hours</strong>. Please pay promptly to secure your room.
        </div>
        <div style="background:#2c3e2d;border-radius:6px;padding:16px 20px;color:#fff;">
          <p style="margin:0 0 8px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:.06em;">Hotel Contact</p>
          <p style="margin:3px 0;font-size:13px;">📍 Zoo Road, Tallital, Nainital – 263001, Uttarakhand</p>
          <p style="margin:3px 0;font-size:13px;">💬 WhatsApp +91 92864 48739</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
          <p style="margin:8px 0 0;font-size:13px;">🕐 Check-in from 12:00 PM &nbsp;|&nbsp; Check-out by 10:00 AM</p>
        </div>
        <p style="font-size:14px;color:#2c3e2d;margin-top:20px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
      </div>
    </div>`;
}

// ── Request Booking (replaces create-order) ───────────────────
app.post("/request-booking", async (req, res) => {
  try {
    const { roomType, name, phone, email, guests, checkIn, checkOut, specialRequests, parking } = req.body;

    if (!name || !email || !phone || !checkIn || !checkOut || !roomType) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const pricePerNight = roomPrices[roomType];
    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
    if (!pricePerNight || !Number.isInteger(nights) || nights < 1 || nights > 30 || isNaN(start) || isNaN(end)) {
      return res.status(400).json({ error: "Invalid room or dates." });
    }
    const grossAmount = pricePerNight * nights;
    const discount = Math.round(grossAmount * DIRECT_BOOKING_DISCOUNT);
    const amount = grossAmount - discount;

    // Generate unique approval token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000; // 48 hours

    const booking = {
      token, name, phone, email, roomType,
      checkIn, checkOut, guests, specialRequests, parking: parking || 'Not specified',
      grossAmount, discount, amount,
      requestedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      expiresAt,
    };

    await kv.set(token, JSON.stringify(booking), "EX", 172800);

    const BACKEND_URL = process.env.BACKEND_URL || "https://hotel-demo-backend.vercel.app";
    const approveUrl = `${BACKEND_URL}/approve-booking/${token}`;
    const disapproveUrl = `${BACKEND_URL}/disapprove-booking/${token}`;

    // Send approval email to owner
    await transporter.sendMail({
      from: `"Hotel Sudarshan" <${process.env.GMAIL_USER}>`,
      to: process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
      replyTo: `"${name}" <${email}>`,
      subject: `🔔 Booking Request — ${roomType} — ${name} — ₹${amount}`,
      html: ownerApprovalEmailHTML(booking, approveUrl, disapproveUrl),
    });

    console.log("✅ Booking request received, approval email sent for:", email);
    res.json({ success: true, message: "Booking request sent. You'll receive a confirmation email once approved." });

  } catch (err) {
    console.error("❌ Request booking error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Approve Booking (owner clicks link in email) ──────────────
app.get("/approve-booking/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const data = await kv.get(token);
    const booking = data ? JSON.parse(data) : null;

    if (!booking) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">❌ Invalid or expired approval link.</h2>
          <p>This booking request no longer exists or has already been processed.</p>
        </body></html>`);
    }

    if (Date.now() > booking.expiresAt) {
      await kv.del(token);
      return res.status(410).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">⏰ This approval link has expired (48 hours).</h2>
          <p>Please ask the guest to submit a new booking request.</p>
        </body></html>`);
    }

    // Create Razorpay Payment Link
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");

    const plRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: booking.amount * 100,
        currency: "INR",
        description: `${booking.roomType} — Hotel Sudarshan Nainital`,
        customer: {
          name: booking.name,
          email: booking.email,
          contact: booking.phone,
        },
        notify: { sms: false, email: false }, // We send our own email
        expire_by: Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000), // 24hr expiry
        notes: {
          room_type: booking.roomType,
          name: booking.name,
          phone: booking.phone,
          email: booking.email,
          check_in_date: booking.checkIn,
          check_out_date: booking.checkOut,
          number_of_guest: booking.guests,
          special_requests: booking.specialRequests || "",
          parking: booking.parking || "Not specified",
        },
      }),
    });

    const pl = await plRes.json();
    if (!pl.short_url) throw new Error("Payment link creation failed: " + JSON.stringify(pl));

    // Send payment link email to guest
    await transporter.sendMail({
      from: `"Hotel Sudarshan Nainital" <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject: `✅ Booking Approved — Complete Your Payment — Hotel Sudarshan Nainital`,
      html: guestPaymentEmailHTML(booking, pl.short_url),
    });

    // Remove from pending
    await kv.del(token);

    console.log("✅ Booking approved, payment link sent to:", booking.email);

    // Show success page to owner
    res.send(`
      <html>
      <head><title>Booking Approved</title></head>
      <body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:#f7f3ec;">
        <div style="max-width:480px;margin:auto;background:#fff;border-radius:10px;padding:40px;border:1px solid #e8dece;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h2 style="color:#2c3e2d;margin-bottom:8px;">Booking Approved!</h2>
          <p style="color:#6b6b5a;font-size:15px;margin-bottom:20px;">
            Payment link has been sent to<br>
            <strong style="color:#2c3e2d;">${booking.email}</strong>
          </p>
          <div style="background:#f7f3ec;border-radius:6px;padding:16px;text-align:left;font-size:14px;">
            <b>Guest:</b> ${booking.name}<br>
            <b>Room:</b> ${booking.roomType}<br>
            <b>Check-in:</b> ${booking.checkIn}<br>
            <b>Check-out:</b> ${booking.checkOut}<br>
            <b>Amount:</b> ₹${booking.amount}
          </div>
          <p style="margin-top:20px;font-size:13px;color:#999;">
            Guest will receive a payment link valid for 24 hours.
          </p>
        </div>
      </body>
      </html>`);

  } catch (err) {
    console.error("❌ Approve booking error:", err.message);
    res.status(500).send(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;">
        <h2 style="color:#8b1a1a;">❌ Something went wrong.</h2>
        <p>${err.message}</p>
        <p>Please contact support or try again.</p>
      </body></html>`);
  }
});


// ── Email: Guest — Booking Rejected ──────────────────────────
function guestRejectionEmailHTML(b) {
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;color:#6b6b5a;width:140px;">${label}</td>
      <td style="padding:6px 0;font-weight:600;color:#2c3e2d;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:28px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:24px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Booking Request Update</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:15px;color:#3a3a2e;margin-bottom:20px;">
          Dear <strong>${b.name || "Guest"}</strong>,<br><br>
          Thank you for your interest in <strong>Hotel Sudarshan Nainital</strong>.<br><br>
          Unfortunately, we are unable to accommodate your booking request for the selected dates. This may be due to unavailability or other operational reasons.
        </p>
        <div style="background:#f7f3ec;border-left:4px solid #c9a84c;padding:16px 20px;border-radius:4px;margin-bottom:24px;">
          <p style="margin:0 0 10px;font-size:13px;color:#6b6b5a;text-transform:uppercase;letter-spacing:.06em;">Your Request Details</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Room Type", b.roomType || "—")}
            ${row("Check-in", b.checkIn || "—")}
            ${row("Check-out", b.checkOut || "—")}
            ${row("No. of Guests", b.guests || "—")}
            ${row("Amount", `₹${b.amount}`)}
          </table>
        </div>
        <div style="background:#fff8e1;border-left:4px solid #f5c842;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:13px;color:#6b4c00;">
          We encourage you to try different dates or contact us directly — we'd love to host you!
        </div>
        <div style="background:#2c3e2d;border-radius:6px;padding:16px 20px;color:#fff;">
          <p style="margin:0 0 8px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:.06em;">Contact Us</p>
          <p style="margin:3px 0;font-size:13px;">📍 Zoo Road, Tallital, Nainital – 263001, Uttarakhand</p>
          <p style="margin:3px 0;font-size:13px;">💬 WhatsApp +91 92864 48739</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
        </div>
        <p style="font-size:14px;color:#2c3e2d;margin-top:20px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
      </div>
    </div>`;
}

// ── Disapprove Booking (owner clicks link in email) ───────────
app.get("/disapprove-booking/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const data = await kv.get(token);
    const booking = data ? JSON.parse(data) : null;

    if (!booking) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">❌ Invalid or expired link.</h2>
          <p>This booking request no longer exists or has already been processed.</p>
        </body></html>`);
    }

    if (Date.now() > booking.expiresAt) {
      await kv.del(token);
      return res.status(410).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">⏰ This link has expired (48 hours).</h2>
          <p>The booking request is no longer active.</p>
        </body></html>`);
    }

    // Send rejection email to guest
    await transporter.sendMail({
      from: `"Hotel Sudarshan Nainital" <${process.env.GMAIL_USER}>`,
      to: booking.email,
      subject: `Booking Request Update — Hotel Sudarshan Nainital`,
      html: guestRejectionEmailHTML(booking),
    });

    // Remove from pending
    await kv.del(token);

    console.log("❌ Booking disapproved, notification sent to:", booking.email);

    // Show confirmation page to owner
    res.send(`
      <html>
      <head><title>Booking Disapproved</title></head>
      <body style="font-family:Arial,sans-serif;text-align:center;padding:60px;background:#f7f3ec;">
        <div style="max-width:480px;margin:auto;background:#fff;border-radius:10px;padding:40px;border:1px solid #e8dece;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
          <div style="font-size:48px;margin-bottom:16px;">❌</div>
          <h2 style="color:#8b1a1a;margin-bottom:8px;">Booking Disapproved</h2>
          <p style="color:#6b6b5a;font-size:15px;margin-bottom:20px;">
            A notification has been sent to<br>
            <strong style="color:#2c3e2d;">${booking.email}</strong>
          </p>
          <div style="background:#f7f3ec;border-radius:6px;padding:16px;text-align:left;font-size:14px;">
            <b>Guest:</b> ${booking.name}<br>
            <b>Room:</b> ${booking.roomType}<br>
            <b>Check-in:</b> ${booking.checkIn}<br>
            <b>Check-out:</b> ${booking.checkOut}<br>
            <b>Amount:</b> ₹${booking.amount}
          </div>
          <p style="margin-top:20px;font-size:13px;color:#999;">
            The guest has been informed and the request has been removed.
          </p>
        </div>
      </body>
      </html>`);

  } catch (err) {
    console.error("❌ Disapprove booking error:", err.message);
    res.status(500).send(`
      <html><body style="font-family:Arial;text-align:center;padding:60px;">
        <h2 style="color:#8b1a1a;">❌ Something went wrong.</h2>
        <p>${err.message}</p>
        <p>Please contact support or try again.</p>
      </body></html>`);
  }
});

// ── Contact Form ─────────────────────────────────────────────
app.post("/contact", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, checkIn, checkOut, roomType, message } = req.body;

    await transporter.sendMail({
      from: `"Hotel Sudarshan Website" <${process.env.GMAIL_USER}>`,
      to: process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
      replyTo: `"${firstName} ${lastName}" <${email}>`,
      subject: `📩 New Enquiry from ${firstName} ${lastName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
          <div style="background:#2c3e2d;padding:24px;text-align:center;">
            <h1 style="color:#c9a84c;margin:0;font-size:22px;">Hotel Sudarshan Nainital</h1>
            <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;">📩 New Contact Form Enquiry</p>
          </div>
          <div style="padding:24px;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr style="background:#f7f3ec;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Name</td><td style="padding:10px 12px;border:1px solid #e8dece;">${firstName} ${lastName}</td></tr>
              <tr style="background:#ffffff;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Email</td><td style="padding:10px 12px;border:1px solid #e8dece;">${email || "—"}</td></tr>
              <tr style="background:#f7f3ec;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Phone</td><td style="padding:10px 12px;border:1px solid #e8dece;">${phone || "—"}</td></tr>
              <tr style="background:#ffffff;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Room Type</td><td style="padding:10px 12px;border:1px solid #e8dece;">${roomType || "—"}</td></tr>
              <tr style="background:#f7f3ec;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Check-in</td><td style="padding:10px 12px;border:1px solid #e8dece;">${checkIn || "—"}</td></tr>
              <tr style="background:#ffffff;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Check-out</td><td style="padding:10px 12px;border:1px solid #e8dece;">${checkOut || "—"}</td></tr>
              <tr style="background:#f7f3ec;"><td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">Message</td><td style="padding:10px 12px;border:1px solid #e8dece;">${message || "—"}</td></tr>
            </table>
          </div>
          <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
            Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
          </div>
        </div>`,
    });

    console.log("✅ Contact email sent");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Contact email error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


module.exports = app;

// Vercel imports the Express app. Normal Node hosting needs a listener.
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Hotel backend listening on port ${port}`));
}
