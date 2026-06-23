# HRFast - Local AI CV Ranking Engine

HRFast is a local Applicant Tracking System powered by **Ollama**, **FastAPI**, **PostgreSQL**, and **Next.js**. It lets recruiters manage job roles, upload candidate resumes, automatically extract details, and perform local AI evaluations to rank candidates on interactive leaderboards.

### Dashboard overview

![Dashboard overview](web/public/images/screenshots/dashboard.png)

### Upload resumes and auto-fill details

![Resume upload and auto-fill details](web/public/images/screenshots/upload.png)

### Candidate leaderboard and AI evaluation reports

![Ranked candidate leaderboard and detailed justification](web/public/images/screenshots/leaderboard.png)

## What You Can Do

- Manage job openings and role descriptions.
- Drag-and-drop PDF resumes to import them.
- Automatically parse candidate first name, last name, email, and phone numbers during upload.
- Run batch AI evaluations to score all resumes against job requirements.
- View ranked candidate leaderboards based on match scores.
- Inspect detailed AI justifications and identified skills for each candidate.
- Run local evaluations using configurable Ollama models.

## Evaluation Flow

1. Open `/roles` and create a new Job Role.
2. Open `/upload` and drop candidate PDF resumes. The system will automatically parse and pre-fill the candidate's details.
3. Open the Job Role page (`/role/<id>`) and click **⚡ Run Batch AI Evaluation**.
4. The backend queues evaluations and scores each candidate against the role requirements in the background using local Ollama.
5. Click **↻ Refresh** to load the updated candidate rankings and click any candidate to see their detailed AI evaluation report.

## Tech Stack

| Layer         | Technology                                            |
| ------------- | ----------------------------------------------------- |
| Framework     | FastAPI (Python 3.11+) / Next.js 14+ (App Router)      |
| UI            | React, Tailwind CSS, Shadcn UI                        |
| Database      | PostgreSQL (on Windows via Scoop)                     |
| AI Engine     | Ollama (Llama 3.2 / local model)                      |

## Local Setup

### 1. Database Configuration (Windows via Scoop)

Scoop PostgreSQL runs on **Windows**. WSL2 must be able to reach it.

```powershell
# Windows PowerShell — start Postgres
pg_ctl start -D "$env:PGDATA"

# Create the database
psql -U postgres -c "CREATE DATABASE hr_ats_db;"
```

#### Connect from WSL2 → Windows PostgreSQL
Add to `C:\Users\USER\.wslconfig` (requires WSL2 2.0+, mirrored networking):
```ini
[wsl2]
networkingMode=mirrored
```
Then restart WSL: `wsl --shutdown`.

#### Allow WSL connections in pg_hba.conf
Ensure your Scoop PostgreSQL `pg_hba.conf` contains:
```
host    all    all    0.0.0.0/0    trust
```
And `postgresql.conf` has:
```
listen_addresses = '*'
```
Then restart Postgres: `pg_ctl restart -D "$env:PGDATA"`.

### 2. Ollama Setup (WSL Ubuntu)

```bash
# Install Ollama in WSL
curl -fsSL https://ollama.com/install.sh | sh

# Pull the model (llama3.2 recommended)
ollama pull llama3.2

# Start Ollama server (runs on http://localhost:11434)
ollama serve
```

### 3. Backend Setup (WSL Ubuntu)

```bash
# Navigate to the api directory
cd api

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

The API is live at `http://localhost:8000`. Interactive docs: `http://localhost:8000/docs`.

### 4. Frontend Setup (Windows)

```powershell
# Windows PowerShell
cd web

# Install dependencies and start dev server
npm install
npm run dev
```

The frontend is live at `http://localhost:3000`.

## Main Routes

| Path           | Purpose                                                  |
| -------------- | -------------------------------------------------------- |
| `/`            | Dashboard overview showing stats                         |
| `/roles`       | List of job openings and create role form                |
| `/upload`      | Resume upload zone with automatic candidate auto-fill    |
| `/role/{id}`   | Ranked candidate leaderboard and AI evaluation summaries |

## Troubleshooting

- **`asyncpg` cannot connect to PostgreSQL**: Check WSL→Windows networking. Verify `pg_hba.conf` allows the connection.
- **Ollama returns timeout**: Make sure `ollama serve` is running in WSL. Check `http://localhost:11434` responds.
- **`pdfplumber` extraction fails**: The service falls back to PyPDF2 automatically. If both fail, the PDF may be image-only (scanned) without extractable text.
