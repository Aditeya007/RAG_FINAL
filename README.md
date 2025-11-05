# RAG-2 - Multi-Tenant RAG Chatbot System

AI-powered chatbot system with admin backend, frontend, and bot service.

---

## 📋 What You Need

- Node.js (v16+)
- Python (3.8+)
- MongoDB
- Google API Key ([Get here](https://makersuite.google.com/app/apikey))

---

## 🚀 Quick Setup

### Step 1: Create `.env` File

Create a `.env` file in the **root folder** (next to this README) with these settings:

```env
# Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=rag_chatbot
MONGO_URI=mongodb://localhost:27017/rag_chatbot

# Security Secrets (Generate these - see below)
JWT_SECRET=your_secret_here
FASTAPI_SHARED_SECRET=your_secret_here

# Google AI
GOOGLE_API_KEY=your_google_api_key

# Service URLs
FASTAPI_BOT_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:3000

# Settings
NODE_ENV=development
PORT=5000

# Python Path (use "python" or "python3" depending on your system)
PYTHON_BIN=python

# Other Settings
UPDATER_MONGODB_URI=mongodb://localhost:27017/
UPDATER_MONGODB_DATABASE=scraper_updater
DEFAULT_VECTOR_BASE_PATH=./tenant-vector-stores
CHROMA_DB_PATH=./test_DB
CHROMA_COLLECTION_NAME=scraped_content
DEFAULT_DATABASE_URI_BASE=mongodb://localhost:27017
DEFAULT_BOT_BASE_URL=http://localhost:8000
DEFAULT_SCHEDULER_BASE_URL=http://localhost:9000
DEFAULT_SCRAPER_BASE_URL=http://localhost:7000
SCRAPER_LOG_LEVEL=INFO
UPDATER_LOG_LEVEL=INFO
```

**🔒 Generate Security Secrets:**

Run this command twice to generate `JWT_SECRET` and `FASTAPI_SHARED_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy each output into your `.env` file.

---

### Step 2: Install Everything

```bash
# Install Python packages
pip install -r requirements.txt

# Install backend packages
cd admin-backend
npm install
cd ..

# Install frontend packages
cd admin-frontend
npm install
cd ..
```

---

### Step 3: Start Services

Open **3 terminals** from the project root folder:

**Terminal 1 - Backend:**
```bash
node admin-backend/server.js
```

**Terminal 2 - Bot:**
```bash
python BOT/app_20.py
```

**Terminal 3 - Frontend:**
```bash
cd admin-frontend
npm start
```

---

## ✅ Check It's Working

Open these in your browser:
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:5000/api/health
- **Bot:** http://localhost:8000/health

---

## 🌐 For Production (Server Deployment)

Update your `.env` file:

```env
# Change to production
NODE_ENV=production

# Use cloud MongoDB (recommended: MongoDB Atlas)
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/database
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/database

# Update URLs to your server domain
FASTAPI_BOT_URL=https://yourdomain.com:8000
CORS_ORIGIN=https://yourdomain.com

# Generate NEW secrets for production
JWT_SECRET=production_secret_here
FASTAPI_SHARED_SECRET=production_secret_here

# System Python path
PYTHON_BIN=/usr/bin/python3
```

---

## 💡 Tips

- All commands should be run from the **project root folder**
- Only one `.env` file needed (in the root folder)
- Make sure MongoDB is running before starting services
- Each service needs its own terminal window

---

## ❓ Need Help?

**Can't connect to MongoDB?**
- Check MongoDB is running: `mongosh`
- Verify `MONGODB_URI` in `.env`

**Port already in use?**
- Change `PORT` in `.env` or stop the other service

**Missing JWT_SECRET error?**
- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Add to `.env` file

