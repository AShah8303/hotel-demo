require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const app = express();

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
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
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
          <p style="margin:3px 0;font-size:13px;">📞 +91 78953 54272 &nbsp;|&nbsp; +91 59422 35574</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
          <p style="margin:8px 0 0;font-size:13px;">🕐 Check-in from 10:00 AM &nbsp;|&nbsp; Check-out by 10:00 AM</p>
        </div>
        <p style="font-size:13px;color:#6b6b5a;margin-top:20px;line-height:1.6;">
          For any questions, feel free to call or WhatsApp us. We're available 24/7.
        </p>
        <p style="font-size:14px;color:#2c3e2d;margin-top:4px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
      </div>
    </div>`;
}

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = [
  "https://hotelsudarshannainital.com",
  "https://www.hotelsudarshannainital.com",
  "https://hotelsudarshannainital.vercel.app"
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

// ── Webhook Route (express.json se PEHLE) ───────────────────
app.post("/razorpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

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

  if (event.event === "payment_link.paid" || event.event === "payment.authorized") {
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

// ── JSON Middleware (webhook ke BAAD) ────────────────────────
app.use(express.json());

// ── In-Memory Pending Bookings Store ─────────────────────────
// (Use a DB like MongoDB/Redis in production)
// IMPORTANT: Add BACKEND_URL=https://your-backend-url.com to your .env file
const pendingBookings = new Map();

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
          ${row("#f7f3ec", "Total Amount", `<strong style="color:#2c3e2d;font-size:16px;">₹${b.amount}</strong>`)}
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
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
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
          <p style="margin:3px 0;font-size:13px;">📞 +91 78953 54272 &nbsp;|&nbsp; +91 59422 35574</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
          <p style="margin:8px 0 0;font-size:13px;">🕐 Check-in from 10:00 AM &nbsp;|&nbsp; Check-out by 10:00 AM</p>
        </div>
        <p style="font-size:14px;color:#2c3e2d;margin-top:20px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
      </div>
    </div>`;
}

// ── Request Booking (replaces create-order) ───────────────────
app.post("/request-booking", async (req, res) => {
  try {
    const { amount, roomType, name, phone, email, guests, checkIn, checkOut, specialRequests } = req.body;

    if (!name || !email || !phone || !checkIn || !checkOut || !roomType) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Generate unique approval token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + 48 * 60 * 60 * 1000; // 48 hours

    const booking = {
      token, name, phone, email, roomType,
      checkIn, checkOut, guests, specialRequests, amount,
      requestedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      expiresAt,
    };

    pendingBookings.set(token, booking);

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
    const booking = pendingBookings.get(token);

    if (!booking) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">❌ Invalid or expired approval link.</h2>
          <p>This booking request no longer exists or has already been processed.</p>
        </body></html>`);
    }

    if (Date.now() > booking.expiresAt) {
      pendingBookings.delete(token);
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
    pendingBookings.delete(token);

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
          <p style="margin:3px 0;font-size:13px;">📞 +91 78953 54272 &nbsp;|&nbsp; +91 59422 35574</p>
          <p style="margin:3px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
        </div>
        <p style="font-size:14px;color:#2c3e2d;margin-top:20px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
      </div>
    </div>`;
}

// ── Disapprove Booking (owner clicks link in email) ───────────
app.get("/disapprove-booking/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const booking = pendingBookings.get(token);

    if (!booking) {
      return res.status(404).send(`
        <html><body style="font-family:Arial;text-align:center;padding:60px;">
          <h2 style="color:#8b1a1a;">❌ Invalid or expired link.</h2>
          <p>This booking request no longer exists or has already been processed.</p>
        </body></html>`);
    }

    if (Date.now() > booking.expiresAt) {
      pendingBookings.delete(token);
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
    pendingBookings.delete(token);

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
            Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
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

// ── Email: Cancellation Confirmation (Guest) ─────────────────
function guestCancelEmailHTML(b) {
  const row = (label, value) => `
    <tr>
      <td style="padding:6px 0;color:#6b6b5a;width:160px;">${label}</td>
      <td style="padding:6px 0;font-weight:600;color:#2c3e2d;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#2c3e2d;padding:28px;text-align:center;">
        <h1 style="color:#c9a84c;margin:0;font-size:24px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Booking Cancelled</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:15px;color:#3a3a2e;margin-bottom:20px;">
          Dear <strong>${b.name || "Guest"}</strong>,<br><br>
          Your booking has been successfully cancelled. Here are the details:
        </p>
        <div style="background:#f7f3ec;border-left:4px solid #c9a84c;padding:16px 20px;border-radius:4px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;color:#6b6b5a;text-transform:uppercase;letter-spacing:.06em;">Cancellation Summary</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Payment ID", b.paymentId)}
            ${row("Room Type", b.roomType || "—")}
            ${row("Check-in", b.checkIn || "—")}
            ${row("Check-out", b.checkOut || "—")}
            ${row("Amount Paid", "Rs." + b.amountPaid)}
            ${row("Cancellation Charge", b.deduction > 0 ? "Rs." + b.deduction + " (50%)" : "None — Free Cancellation")}
            ${row("Refund Amount", "<span style='color:#2c7a2c;font-weight:700;'>Rs." + b.refundAmount + "</span>")}
            ${row("Refund Timeline", "5–7 working days")}
          </table>
        </div>
        <div style="background:#fff8e1;border-left:4px solid #f5c842;padding:12px 16px;border-radius:4px;margin-bottom:20px;font-size:13px;color:#6b4c00;">
          Your refund will be credited to your original payment method within 5–7 working days.
        </div>
        <div style="background:#2c3e2d;border-radius:6px;padding:16px 20px;color:#fff;">
          <p style="margin:0 0 8px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:.06em;">Need Help?</p>
          <p style="margin:3px 0;font-size:13px;">+91 78953 54272 | +91 59422 35574</p>
          <p style="margin:3px 0;font-size:13px;">hotelsudarshannainital@gmail.com</p>
        </div>
        <p style="font-size:14px;color:#2c3e2d;margin-top:20px;">
          Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong>
        </p>
      </div>
      <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
      </div>
    </div>`;
}

// ── Email: Cancellation Alert (Owner) ────────────────────────
function ownerCancelEmailHTML(b) {
  const row = (bg, label, value) => `
    <tr style="background:${bg};">
      <td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;">${label}</td>
      <td style="padding:10px 12px;border:1px solid #e8dece;">${value}</td>
    </tr>`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      <div style="background:#8b1a1a;padding:24px;text-align:center;">
        <h1 style="color:#f5c842;margin:0;font-size:22px;">Hotel Sudarshan Nainital</h1>
        <p style="color:rgba(255,255,255,0.9);margin:6px 0 0;">Booking Cancelled — Refund Processed</p>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${row("#f7f3ec", "Payment ID", b.paymentId)}
          ${row("#ffffff", "Guest Name", b.name || "—")}
          ${row("#f7f3ec", "Phone", b.phone || "—")}
          ${row("#ffffff", "Email", b.email || "—")}
          ${row("#f7f3ec", "Room Type", b.roomType || "—")}
          ${row("#ffffff", "Check-in", b.checkIn || "—")}
          ${row("#f7f3ec", "Check-out", b.checkOut || "—")}
          ${row("#ffffff", "Amount Paid", "Rs." + b.amountPaid)}
          ${row("#f7f3ec", "Cancellation Type", b.deduction > 0 ? "Within 24 hrs of check-in (50% charge applied)" : "More than 24 hrs before check-in (Free Cancellation)")}
          ${row("#ffffff", "Cancellation Charge", b.deduction > 0 ? "Rs." + b.deduction : "Rs. 0")}
          ${row("#ffe4e4", "Refund Processed", "<strong style='color:#8b1a1a;'>Rs." + b.refundAmount + "</strong>")}
        </table>
      </div>
      <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
        Hotel Sudarshan · Zoo Road, Tallital, Nainital · +91 78953 54272
      </div>
    </div>`;
}

// ── Update Google Sheet on Cancellation ──────────────────────
async function updateSheetOnCancel(paymentId, refundAmount, deduction) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Bookings!A:L",
    });

    const rows = result.data.values || [];
    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][1] === paymentId) { rowIndex = i + 1; break; }
    }

    if (rowIndex === -1) {
      console.warn("Row not found for paymentId:", paymentId);
      return;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Bookings!L" + rowIndex,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [["Cancelled | Refund Rs." + refundAmount + " | Charge Rs." + deduction]] },
    });

    console.log("Sheet updated with cancellation for:", paymentId);
  } catch (err) {
    console.error("Sheet cancellation update error:", err.message);
  }
}

// ── Cancel Booking Route ──────────────────────────────────────
app.post("/cancel-booking", async (req, res) => {
  try {
    const { paymentId, email } = req.body;

    if (!paymentId || !email) {
      return res.status(400).json({ error: "Payment ID and email are required." });
    }

    const authHeader = Buffer.from(
      process.env.RAZORPAY_KEY_ID + ":" + process.env.RAZORPAY_KEY_SECRET
    ).toString("base64");

    // 1. Fetch payment from Razorpay
    const payRes = await fetch("https://api.razorpay.com/v1/payments/" + paymentId, {
      headers: { Authorization: "Basic " + authHeader },
    });
    const payment = await payRes.json();

    if (payment.error || !payment.id) {
      return res.status(404).json({ error: "Payment ID not found. Please check and try again." });
    }

    // 2. Verify email matches
    const paymentEmail = payment.email || payment.notes?.email || "";
    if (paymentEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ error: "Email does not match our records. Please enter the email used at the time of booking." });
    }

    // 3. Check if already refunded
    if (payment.refund_status === "full") {
      return res.status(400).json({ error: "A refund for this booking has already been processed." });
    }

    // 4. Calculate refund based on 24hr window before check-in date
    const notes = payment.notes || {};
    const amountPaid = payment.amount / 100;

    let refundAmount = amountPaid;
    let deduction = 0;

    // Check-in date is stored in payment notes
    const checkInRaw = notes["check_in_date"] || notes["Check In date"] || notes["Check-in Date"] || notes["checkin"] || "";
    const checkInDate = checkInRaw ? new Date(checkInRaw) : null;
    const now = Date.now();

    if (checkInDate && !isNaN(checkInDate.getTime())) {
      checkInDate.setHours(0, 0, 0, 0);
      const hoursUntilCheckIn = (checkInDate.getTime() - now) / (1000 * 60 * 60);

      if (hoursUntilCheckIn < 24) {
        // Within 24 hours of check-in — 50% deduction
        deduction = Math.round(amountPaid * 0.5);
        refundAmount = amountPaid - deduction;
      }
      // More than 24 hours before check-in — full refund (deduction stays 0)
    } else {
      // check-in date not found in notes — fallback: full refund
      console.warn("check_in_date not found in payment notes, issuing full refund. paymentId:", paymentId);
    }

    // 5. Initiate refund via Razorpay
    const refundRes = await fetch("https://api.razorpay.com/v1/payments/" + paymentId + "/refund", {
      method: "POST",
      headers: {
        Authorization: "Basic " + authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: refundAmount * 100 }),
    });
    const refund = await refundRes.json();

    if (refund.error) {
      console.error("Razorpay refund error:", refund.error);
      return res.status(500).json({ error: "Refund could not be processed. Please contact us at +91 78953 54272." });
    }

    const bookingInfo = {
      paymentId,
      name: notes.name || "Guest",
      phone: notes.phone || "—",
      email: email,
      roomType: notes.room_type || "—",
      checkIn: notes.check_in_date || "—",
      checkOut: notes.check_out_date || "—",
      amountPaid,
      deduction,
      refundAmount,
    };

    // 6. Send guest cancellation email
    try {
      await transporter.sendMail({
        from: '"Hotel Sudarshan Nainital" <' + process.env.GMAIL_USER + '>',
        to: email,
        subject: "Booking Cancelled — Refund of Rs." + refundAmount + " Initiated",
        html: guestCancelEmailHTML(bookingInfo),
      });
    } catch (e) { console.error("Guest cancel email error:", e.message); }

    // 7. Send owner cancellation alert
    try {
      await transporter.sendMail({
        from: '"Hotel Sudarshan" <' + process.env.GMAIL_USER + '>',
        to: process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
        replyTo: '"' + bookingInfo.name + '" <' + email + '>',
        subject: "Booking Cancelled — " + bookingInfo.roomType + " — Refund Rs." + refundAmount,
        html: ownerCancelEmailHTML(bookingInfo),
      });
    } catch (e) { console.error("Owner cancel email error:", e.message); }

    // 8. Update Google Sheet
    await updateSheetOnCancel(paymentId, refundAmount, deduction);

    console.log("Cancellation processed:", paymentId, "| Refund:", refundAmount);
    res.json({ success: true, refundAmount, deduction, amountPaid });

  } catch (err) {
    console.error("Cancel booking error:", err.message);
    res.status(500).json({ error: "Something went wrong. Please contact us at +91 78953 54272." });
  }
});
