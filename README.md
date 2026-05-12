# 🛡️ Trust Vault — CloudVault Centre

<div align="center">

### 🎬 Click the image to watch the demo

[![Trust Vault](YOUR_IMAGE_URL_HERE)](https://youtu.be/OR2Ai4_dho0?si=OlAhyRaeyuJ0Qv5a)

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

</div>

## 🚀 Overview

A secure full-stack cloud-based vault system for managing sensitive data with authentication, logging, and role-based access control.

## ✨ Features

- 🔐 JWT-based authentication & middleware protection
- 📊 Request logging via `logs/access.log`
- ⚙️ Modular Express.js REST API
- 🎨 Responsive Vite + Tailwind CSS frontend
- 🔒 Environment variable security via `.env`

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Security | JWT, Middleware, dotenv |
| Logging | File-based (access.log) |

## 📁 Project Structure
TRUST VAULT
│
├── backend/
│   ├── logs/
│   │   └── access.log
│   ├── middleware/
│   ├── routes/
│   ├── scripts/
│   ├── utils/
│   ├── .env
│   ├── .env.example
│   ├── server.js
│   └── package.json
│
└── frontend/
├── src/
├── dist/
├── index.html
├── vite.config.js
├── tailwind.config.cjs
├── postcss.config.cjs
└── package.json


## ⚙️ Installation

**1. Clone the repo**

```bash
git clone https://github.com/Laxmisri2005/cloudvault-centre.git
cd cloudvault-centre
```

**2. Backend setup**

```bash
cd backend
npm install
```

Create `.env` file:

```env
PORT=5000
JWT_SECRET=your_secret_key
```

Run backend:

```bash
node server.js
```

**3. Frontend setup**

```bash
cd frontend
npm install
npm run dev
```

## ▶️ Run

| Service | URL |
|---------|-----|
| Backend | http://localhost:5000 |
| Frontend | http://localhost:5173 |

## 🔒 Security Highlights

- Middleware-protected routes
- Environment variable protection via `.env`
- Centralized request logging system
- Clean separation of frontend & backend

## 📜 License

MIT
