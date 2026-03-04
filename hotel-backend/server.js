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
          ${row("#f7f3ec", "Booking ID",       b.paymentId)}
          ${row("#ffffff", "Guest Name",       b.name      || "—")}
          ${row("#f7f3ec", "Phone",            b.phone     || "—")}
          ${row("#ffffff", "Email",            b.email     || "—")}
          ${row("#f7f3ec", "Room Type",        b.roomType  || "—")}
          ${row("#ffffff", "Check-in",         b.checkIn   || "—")}
          ${row("#f7f3ec", "Check-out",        b.checkOut  || "—")}
          ${row("#ffffff", "No. of Guests",    b.guests    || "—")}
          ${row("#f7f3ec", "Special Requests", b.specialRequests || "None")}
          ${row("#ffffff", "Amount Paid",      `<strong style="color:#2c3e2d;font-size:16px;">₹${b.amount}</strong>`)}
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
            ${row("Booking ID",    b.paymentId)}
            ${row("Room Type",     b.roomType  || "—")}
            ${row("Check-in",      b.checkIn   || "—")}
            ${row("Check-out",     b.checkOut  || "—")}
            ${row("No. of Guests", b.guests    || "—")}
            ${row("Amount Paid",   `₹${b.amount}`)}
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
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;
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
    const payment     = event.payload?.payment?.entity     || {};
    const customer    = paymentLink.customer || {};
    const notes       = paymentLink.notes || payment.notes || {};

    const booking = {
      paymentId:       payment.id                || paymentLink.id || "N/A",
      name:            customer.name             || notes["name"]             || notes["Name"]             || notes["Full Name"]       || "—",
      phone:           customer.contact          || notes["phone"]            || notes["Phone"]            || notes["Phone Number"]    || "—",
      email:           customer.email            || payment.email             || "—",
      roomType:        notes["room_type"]        || notes["Room Type"]        || notes["room type"]        || paymentLink.description  || "—",
      checkIn:         notes["check_in_date"]    || notes["Check In date"]    || notes["Check-in Date"]    || notes["checkin"]         || "—",
      checkOut:        notes["check_out_date"]   || notes["Check Out Date"]   || notes["Check-out Date"]   || notes["checkout"]        || "—",
      guests:          notes["number_of_guest"]  || notes["Number Of Guest"]  || notes["Number of Guest"] || notes["guest"]          || "—",
      specialRequests: notes["special_requests"] || notes["Special Requests"] || "—",
      amount:          (payment.amount || paymentLink.amount || 0) / 100,
    };

    console.log("📋 Booking:", booking);

    // 1. Owner email
    try {
      await transporter.sendMail({
        from:    `"Hotel Sudarshan" <${process.env.GMAIL_USER}>`,
        to:      process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
        subject: `🏨 New Booking — ${booking.roomType} — ₹${booking.amount}`,
        html:    ownerEmailHTML(booking),
      });
      console.log("✅ Owner email sent");
    } catch (err) {
      console.error("❌ Owner email error:", err.message);
    }

    // 2. Guest confirmation email
    if (booking.email && booking.email !== "—") {
      try {
        await transporter.sendMail({
          from:    `"Hotel Sudarshan Nainital" <${process.env.GMAIL_USER}>`,
          to:      booking.email,
          subject: `✅ Booking Confirmed — Hotel Sudarshan Nainital`,
          html:    guestEmailHTML(booking),
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

// ── Create Razorpay Order ─────────────────────────────────────
app.post("/create-order", async (req, res) => {
  try {
    const { amount, roomType, name, phone, email, guests, checkIn, checkOut, specialRequests } = req.body;

    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");

    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amount * 100,
        currency: "INR",
        notes: {
          room_type: roomType,
          name, phone, email,
          check_in_date: checkIn,
          check_out_date: checkOut,
          number_of_guest: guests,
          special_requests: specialRequests || "",
        },
      }),
    });

    const order = await orderRes.json();
    if (!order.id) throw new Error("Order creation failed");

    res.json({ orderId: order.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("❌ Create order error:", err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── Contact Form ─────────────────────────────────────────────
app.post("/contact", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, checkIn, checkOut, roomType, message } = req.body;

    await transporter.sendMail({
      from: `"Hotel Sudarshan Website" <${process.env.GMAIL_USER}>`,
      to: process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
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
