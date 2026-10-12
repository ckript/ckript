<div align="center">

# 🎬 Ckript

**The full-stack platform connecting creators, actors, investors, producers, and readers in the entertainment industry.**

Share scripts. Discover talent. Fund projects. Collaborate — all in one place.

[![Live](https://img.shields.io/badge/live-ckript.com-black?style=for-the-badge)](https://ckript.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-Express%205-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)

</div>

---

## ✨ What is Ckript?

Ckript is an entertainment-industry marketplace and collaboration hub. Writers upload and pitch screenplays, producers and investors discover and fund projects, actors find auditions, and everyone communicates, negotiates, and closes deals in one connected workspace — with AI-assisted script tools baked in.

---

## 🚀 Features

| | |
|---|---|
| 📜 **Script marketplace** | Upload, browse, search, and read screenplays with custom screenplay-format rendering |
| 🤖 **AI tools** | AI-assisted script analysis & concept generation (Groq + Google AI) |
| 💰 **Pitching & funding** | Script pitches, purchase requests, agreements, invoices, investor mandates |
| ✍️ **Live collaboration** | Real-time collaborative script editing & scene presence via Socket.IO |
| 🎭 **Auditions & casting** | Post and apply to auditions |
| 📹 **Video meetings** | Jitsi video calls with Google Calendar scheduling |
| 💬 **Messaging & notifications** | Real-time chat and notification feeds |
| 💳 **Payments** | Stripe & Razorpay for subscriptions/credits, with PDF invoicing |
| 🧭 **Role-based onboarding** | Tailored flows for writers, producers, investors, and readers |
| 🛠️ **Admin dashboard** | User management, moderation, analytics, audit logging |
| ⭐ **Reviews & ratings** | Producer ratings and script reviews |
| 🔍 **SEO-optimized** | Build-time sitemap generation and page prerendering |

---

## 🧱 Tech Stack

<table>
<tr>
<td valign="top" width="50%">

### Frontend — `client/`
- ⚛️ React 19 + Vite 7
- 🧭 React Router 7 · Zustand
- 🎨 Tailwind CSS 4
- 📝 TipTap (rich text) · CodeMirror (script editing)
- 🎞️ Framer Motion · Recharts
- 🔌 Socket.IO client · Firebase · Google OAuth
- 📄 jsPDF · pdfjs-dist
- ✅ Vitest

</td>
<td valign="top" width="50%">

### Backend — `server/`
- 🟢 Node.js + Express 5
- 🍃 MongoDB + Mongoose
- 🔌 Socket.IO (chat, collab, presence)
- 🔐 JWT auth · bcrypt
- 💳 Stripe · Razorpay
- ☁️ Cloudinary
- 🧠 Groq SDK · Google Generative AI
- 📧 Nodemailer
- 📄 PDFKit
- 🛡️ Helmet · rate-limit · hpp · mongo-sanitize

</td>
</tr>
</table>

---

## 📁 Project Structure

```
ckript/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── pages/          # Route-level pages (dashboard, scripts, onboarding, admin...)
│   │   ├── components/     # Reusable UI components
│   │   ├── layouts/        # Page layouts
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom hooks
│   │   ├── services/       # API client layer
│   │   ├── seo/            # SEO helpers
│   │   └── mobile/         # Mobile-specific views
│   └── scripts/            # Sitemap generation & SEO prerendering
│
├── server/                 # Express backend
│   ├── controllers/        # Route handlers
│   ├── routes/             # API route definitions
│   ├── models/             # Mongoose schemas (User, Script, Agreement, Invoice...)
│   ├── middleware/         # Auth, admin, security middleware
│   ├── services/           # AI, recommendation, video generation
│   ├── socket/             # Socket.IO handlers (collab, scene presence)
│   ├── utils/              # PDF gen, email, payments, screenplay parsing...
│   └── scripts/            # Admin/CLI scripts
│
└── scripts/                 # Backup & restore (PowerShell)
```

---

## 🏁 Getting Started

### Prerequisites

- Node.js (LTS)
- MongoDB (local or Atlas)
- npm

### 1. Clone

```bash
git clone https://github.com/ckript/ckript.git
cd ckript
```

### 2. Backend setup

```bash
cd server
npm install
cp .env.example .env
```

Fill in `server/.env`:

| Variable | Purpose |
|---|---|
| `PORT` | API port (defaults to `5002`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Signs auth JWTs |
| `CLIENT_URL` / `CORS_ORIGINS` | Allowed frontend origin(s) |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Media storage |
| `RAZORPAY_KEY_ID/KEY_SECRET` | Payments (India) |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies Razorpay webhooks at `/api/webhooks/razorpay` — required for plan renewals (see `.env.example`) |
| `PLAN_RECURRING_BILLING` | `true` (default): plans are auto-renewing Razorpay Subscriptions. `false`: sell them as one-time purchases |
| `GST_ENABLED` / `TAX_LIABILITY_FROM` / `COMPANY_GSTIN` … | Taxes at checkout (18%, shown as "Taxes"), tax invoices, credit notes and returns — see [docs/TAXES.md](docs/TAXES.md) |
| `STRIPE_*` | Payments (international) |
| `GOOGLE_AI_API_KEY` / `GROQ_API_KEY` | AI features |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET` / `GOOGLE_CALENDAR_REDIRECT_URI` | Google sign-in & Calendar sync |
| `TOKEN_ENC_KEY` | Encrypts stored Google refresh tokens |
| `FILE_UPLOAD_GRANT_SECRET` | Scoped file-upload JWTs |
| `EMAIL_USER` / `EMAIL_PASSWORD` | Transactional email |
| `FIREBASE_*` | Firebase project config |

> See `server/.env.example` for the full list and setup notes (e.g. Google Calendar OAuth).

```bash
npm run dev     # nodemon
# or
npm start
```

### 3. Frontend setup

```bash
cd ../client
npm install
cp .env.example .env
```

Set `VITE_API_URL` to your backend URL, plus Firebase/Google credentials from `client/.env.example`.

```bash
npm run dev
```

App runs at `http://localhost:5173` by default.

---

## 📜 Available Scripts

<details>
<summary><strong>Server</strong></summary>

| Command | Description |
|---|---|
| `npm run dev` | Start API with nodemon |
| `npm start` | Start API |
| `npm run test:url-policy` | Remote asset URL policy tests |
| `npm run test:security-boundaries` | Security-boundary tests |
| `npm run security:audit-remote-assets` | Audit remote asset URLs |
| `npm run seed:indo` | Seed sample scripts |

</details>

<details>
<summary><strong>Client</strong></summary>

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Sitemap → build → SEO prerender → verify |
| `npm run lint` | ESLint |
| `npm run test` | Vitest suite |
| `npm run preview` | Preview production build |

</details>

<details>
<summary><strong>Root (backup tooling, Windows/PowerShell)</strong></summary>

| Command | Description |
|---|---|
| `npm run backup` | Back up code + database |
| `npm run backup:code` / `backup:db` | Back up code or database only |
| `npm run restore:code` / `restore:db` | Restore from latest backup |

See [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md).

</details>

---

## 🔒 Security

Ckript ships with hardening out of the box: Helmet security headers, rate limiting on API/auth/payment routes, MongoDB query sanitization, HPP protection, JWT auth with scoped upload grants, and encrypted storage of OAuth refresh tokens.

See [`SECURITY.md`](./SECURITY.md) for the vulnerability reporting policy.

---

## 📄 License

No license file is currently published in this repository. Contact the maintainers for usage terms.

---

<div align="center">

Made for storytellers, producers, and investors — live at **[ckript.com](https://ckript.com)**

</div>
