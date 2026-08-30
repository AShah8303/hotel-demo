// ============================================================
//  Hotel Sudarshan Nainital — Razorpay Webhook Handler
//  Next.js API Route  →  pages/api/webhook.js
//
//  ENV VARIABLES REQUIRED (.env.local):
//    RAZORPAY_WEBHOOK_SECRET   — from Razorpay Dashboard → Webhooks
//    GMAIL_USER                — your Gmail address (e.g. hotel@gmail.com)
//    GMAIL_APP_PASS            — Gmail App Password (NOT your login password)
//    HOTEL_EMAIL               — where owner notifications go (can be same as GMAIL_USER)
//    GOOGLE_SHEET_ID           — Google Sheet ID from the URL
//    GOOGLE_SERVICE_ACCOUNT    — JSON string of service account credentials
// ============================================================

import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { google } from 'googleapis';

// Disable Next.js body parsing — we need raw body for signature verification
export const config = {
  api: { bodyParser: false },
};

// ── Helpers ──────────────────────────────────────────────────

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// ── Google Sheets: append one booking row ────────────────────
async function appendToGoogleSheet(booking) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Row order matches your sheet headers (see setup guide below)
    const row = [
      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
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
      'Paid',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Bookings!A:L',        // Sheet name must be "Bookings"
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    console.log('✅ Row appended to Google Sheet');
  } catch (err) {
    // Don't crash the webhook if Sheets fails — just log
    console.error('❌ Google Sheets error:', err.message);
  }
}

// ── Email Templates ──────────────────────────────────────────

// 1. Hotel owner notification
function ownerEmailHTML(b) {
  return `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
  <div style="background:#2c3e2d;padding:24px;text-align:center;">
    <h1 style="color:#c9a84c;margin:0;font-size:22px;">Hotel Sudarshan Nainital</h1>
    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">🎉 New Booking Received!</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row('#f7f3ec', 'Booking ID',       b.paymentId)}
      ${row('#ffffff', 'Guest Name',       b.name      || '—')}
      ${row('#f7f3ec', 'Phone',            b.phone     || '—')}
      ${row('#ffffff', 'Email',            b.email     || '—')}
      ${row('#f7f3ec', 'Room Type',        b.roomType  || '—')}
      ${row('#ffffff', 'Check-in',         b.checkIn   || '—')}
      ${row('#f7f3ec', 'Check-out',        b.checkOut  || '—')}
      ${row('#ffffff', 'No. of Guests',    b.guests    || '—')}
      ${row('#f7f3ec', 'Special Requests', b.specialRequests || 'None')}
      ${row('#ffffff', 'Amount Paid',      `<strong style="color:#2c3e2d;font-size:16px;">₹${b.amount}</strong>`)}
    </table>
  </div>
  <div style="background:#f7f3ec;padding:14px;text-align:center;font-size:12px;color:#6b6b5a;">
    Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
  </div>
</div>`;
}

// 2. Guest confirmation email
function guestEmailHTML(b) {
  return `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
  <div style="background:#2c3e2d;padding:28px;text-align:center;">
    <h1 style="color:#c9a84c;margin:0;font-size:24px;">Hotel Sudarshan Nainital</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:15px;">Booking Confirmed ✅</p>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;color:#3a3a2e;margin-bottom:20px;">
      Dear <strong>${b.name || 'Guest'}</strong>,<br><br>
      Thank you for choosing <strong>Hotel Sudarshan Nainital</strong>!
      Your booking has been confirmed and payment received. We look forward to welcoming you.
    </p>

    <div style="background:#f7f3ec;border-left:4px solid #c9a84c;padding:16px 20px;border-radius:4px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:13px;color:#6b6b5a;text-transform:uppercase;letter-spacing:.06em;">Booking Summary</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${guestRow('Booking ID',    b.paymentId)}
        ${guestRow('Room Type',     b.roomType  || '—')}
        ${guestRow('Check-in',      b.checkIn   || '—')}
        ${guestRow('Check-out',     b.checkOut  || '—')}
        ${guestRow('No. of Guests', b.guests    || '—')}
        ${guestRow('Amount Paid',   `₹${b.amount}`)}
      </table>
    </div>

    <div style="background:#2c3e2d;border-radius:6px;padding:16px 20px;color:#fff;">
      <p style="margin:0 0 8px;font-size:13px;color:#c9a84c;text-transform:uppercase;letter-spacing:.06em;">Hotel Contact</p>
      <p style="margin:2px 0;font-size:13px;">📍 Zoo Road, Tallital, Nainital – 263001, Uttarakhand</p>
      <p style="margin:2px 0;font-size:13px;">💬 WhatsApp +91 92864 48739</p>
      <p style="margin:2px 0;font-size:13px;">✉️ hotelsudarshannainital@gmail.com</p>
      <p style="margin:8px 0 0;font-size:13px;">🕐 Check-in from 12:00 PM &nbsp;|&nbsp; Check-out by 10:00 AM</p>
    </div>

    <p style="font-size:13px;color:#6b6b5a;margin-top:20px;line-height:1.6;">
      If you have any questions or special requests, feel free to reach out to us directly.
      Please contact us on WhatsApp if you need assistance.
    </p>
    <p style="font-size:14px;color:#2c3e2d;margin-top:4px;">Warm regards,<br><strong>Hotel Sudarshan Nainital Team</strong></p>
  </div>
  <div style="background:#f7f3ec;padding:12px;text-align:center;font-size:11px;color:#6b6b5a;">
    Hotel Sudarshan · Zoo Road, Tallital, Nainital · 💬 +91 92864 48739
  </div>
</div>`;
}

// Small HTML helpers
function row(bg, label, value) {
  return `<tr style="background:${bg};">
    <td style="padding:10px 12px;border:1px solid #e8dece;font-weight:bold;white-space:nowrap;">${label}</td>
    <td style="padding:10px 12px;border:1px solid #e8dece;">${value}</td>
  </tr>`;
}
function guestRow(label, value) {
  return `<tr>
    <td style="padding:6px 0;color:#6b6b5a;width:130px;">${label}</td>
    <td style="padding:6px 0;font-weight:600;color:#2c3e2d;">${value}</td>
  </tr>`;
}

// ── Main Handler ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // 1. Get raw body & verify Razorpay signature
  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];
  const secret    = process.env.RAZORPAY_WEBHOOK_SECRET;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (signature !== expectedSig) {
    console.warn('⚠️  Invalid Razorpay signature — rejecting');
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(rawBody.toString());
  console.log('📩 Webhook event received:', event.event);

  // ── Handle: payment_link.paid ────────────────────────────
  // This fires when a Razorpay Payment Page / Payment Link is fully paid.
  // The customer object lives at payload.payment_link.entity.customer
  // Custom fields (Check-in, Check-out, etc.) live in notes on the payment_link entity.
  if (event.event === 'payment_link.paid') {
    const paymentLink = event.payload?.payment_link?.entity || {};
    const payment     = event.payload?.payment?.entity     || {};

    // ── Customer details (Razorpay collects these on the payment page) ──
    const customer = paymentLink.customer || {};

    // ── Custom fields from Payment Page (notes) ──────────────
    // These match the "Field Label" names you set in Razorpay Dashboard
    // → Payment Pages → Edit → Custom Fields
    const notes = paymentLink.notes || payment.notes || {};

    const booking = {
      paymentId:       payment.id                || paymentLink.id || 'N/A',
      name:            customer.name             || notes['name']             || notes['Name']             || notes['Full Name']       || '—',
      phone:           customer.contact          || notes['phone']            || notes['Phone']            || notes['Phone Number']    || '—',
      email:           customer.email            || payment.email             || '—',
      roomType:        notes['room_type']        || notes['Room Type']        || notes['room type']        || paymentLink.description  || '—',
      checkIn:         notes['check_in_date']    || notes['Check In date']    || notes['Check-in Date']    || notes['checkin']         || '—',
      checkOut:        notes['check_out_date']   || notes['Check Out Date']   || notes['Check-out Date']   || notes['checkout']        || '—',
      guests:          notes['number_of_guest']  || notes['Number Of Guest']  || notes['Number of Guests'] || notes['guests']          || '—',
      specialRequests: notes['special_requests'] || notes['Special Requests'] || notes['special_request']  || '—',
      amount:          (payment.amount || paymentLink.amount || 0) / 100,
    };

    console.log('📋 Booking data extracted:', booking);

    // 2. Send owner notification email
    try {
      await transporter.sendMail({
        from:    `"Hotel Sudarshan" <${process.env.GMAIL_USER}>`,
        to:      process.env.HOTEL_EMAIL || process.env.GMAIL_USER,
        subject: `🏨 New Booking — ${booking.roomType} — ₹${booking.amount}`,
        html:    ownerEmailHTML(booking),
      });
      console.log('✅ Owner email sent');
    } catch (err) {
      console.error('❌ Owner email error:', err.message);
    }

    // 3. Send guest confirmation email (only if we have their email)
    if (booking.email && booking.email !== '—') {
      try {
        await transporter.sendMail({
          from:    `"Hotel Sudarshan Nainital" <${process.env.GMAIL_USER}>`,
          to:      booking.email,
          subject: `✅ Booking Confirmed — Hotel Sudarshan Nainital`,
          html:    guestEmailHTML(booking),
        });
        console.log('✅ Guest confirmation email sent to:', booking.email);
      } catch (err) {
        console.error('❌ Guest email error:', err.message);
      }
    }

    // 4. Append to Google Sheet
    await appendToGoogleSheet(booking);
  }

  // Always respond 200 quickly so Razorpay doesn't retry
  return res.status(200).json({ status: 'ok' });
}

/*
================================================================================
  SETUP GUIDE — READ THIS BEFORE DEPLOYING
================================================================================

1. RAZORPAY DASHBOARD — Webhook Event
   ─────────────────────────────────────
   Go to: Dashboard → Account & Settings → Webhooks → Edit your webhook
   Make sure this event is CHECKED:  ✅ payment_link.paid
   (Your old code used "payment.captured" — that's for Orders API, not Payment Links)

2. RAZORPAY DASHBOARD — Payment Page Custom Fields
   ──────────────────────────────────────────────────
   Go to: Dashboard → Payment Pages → Edit your page
   Your custom field labels MUST match these exactly (case-sensitive):
     • "Check In date"       (or the webhook will try multiple fallback names)
     • "Check Out Date"
     • "Number Of Guest"
     • "Special Requests"
   The Name, Phone, Email fields are standard — Razorpay collects them automatically.

3. ENV VARIABLES (.env.local)
   ────────────────────────────
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
   GMAIL_USER=hotelsudarshannainital@gmail.com
   GMAIL_APP_PASS=xxxx xxxx xxxx xxxx        ← 16-char App Password from Google
   HOTEL_EMAIL=anjneyshah19@gmail.com         ← where YOU receive notifications
   GOOGLE_SHEET_ID=1BxiMVs0XRA5nFMdKvBdBZjg  ← from your Sheet URL
   GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":...}  ← JSON string

4. GOOGLE SHEETS SETUP
   ─────────────────────
   a) Create a Google Sheet named "Hotel Sudarshan Bookings"
   b) Rename Sheet1 tab to: Bookings
   c) Add these headers in Row 1 (A to L):
      Date & Time | Booking ID | Guest Name | Phone | Email |
      Room Type | Check-in | Check-out | Guests | Special Requests | Amount | Status
   d) Go to console.cloud.google.com → Create Service Account → Download JSON key
   e) Share your Google Sheet with the service account email (Editor access)
   f) Paste the entire JSON as GOOGLE_SERVICE_ACCOUNT env variable

5. INSTALL DEPENDENCIES
   ──────────────────────
   npm install nodemailer googleapis

6. GMAIL APP PASSWORD
   ─────────────────────
   Google Account → Security → 2-Step Verification → App Passwords
   Create one for "Mail" → copy the 16-character password → use as GMAIL_APP_PASS

================================================================================
*/
