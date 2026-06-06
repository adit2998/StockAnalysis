# DeepVal — Stock Analysis Platform

A full-stack web application for analyzing publicly traded companies using SEC filings, financial data, and AI-powered research. Combines Claude AI with real-time market data and SEC EDGAR filings to produce institutional-quality investment analysis.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Running Locally (No Docker)](#running-locally-no-docker)
- [Running with Docker Compose](#running-with-docker-compose)
- [Running on Kubernetes (Minikube)](#running-on-kubernetes-minikube)
- [Processing Company Data](#processing-company-data)
- [Useful Commands Reference](#useful-commands-reference)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router 7, Bootstrap 5, Recharts |
| Backend API | Node.js, Express 5 |
| Data Pipeline | Python 3, pandas, PyMuPDF, yfinance |
| Database | MongoDB 7 (GridFS for PDFs) |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Auth | Google OAuth 2.0 + JWT |
| Market Data | Yahoo Finance, Finnhub |
| DevOps | Docker, Docker Compose, Kubernetes (Minikube) |

---

## Project Structure

```
StockAnalysis/
├── ReadMe.md
├── DOCUMENTATION.md          ← Full technical documentation
├── docker-compose.yml
│
├── Backend/
│   ├── node-backend/         ← Express REST API (port 5001)
│   │   ├── server.js
│   │   ├── routes/
│   │   ├── services/
│   │   ├── middleware/
│   │   └── utils/
│   │
│   └── info-processing/      ← Python data ingestion pipeline
│       ├── company_processing_pipeline.py
│       ├── sec_api_utils.py
│       ├── extractors.py
│       ├── process_reports.py
│       ├── create_dataframe.py
│       ├── save_reports_info.py
│       └── config.py
│
├── fundamental-analysis/     ← React frontend (port 3000)
│   └── src/
│       ├── App.js
│       ├── context/
│       └── components/
│
└── k8s/                      ← Kubernetes manifests
```

---

## Prerequisites

Install the following before proceeding:

- **Node.js** 18+ and npm
- **Python** 3.9+
- **MongoDB Community** (for local dev without Docker)
- **Docker Desktop** (for Docker Compose and Kubernetes)
- **Minikube** (for Kubernetes only)
- **kubectl** (for Kubernetes only)

Install Python dependencies:

```bash
cd Backend/info-processing
pip install pymongo pandas anthropic weasyprint yfinance PyMuPDF python-dotenv requests
```

Install Node dependencies:

```bash
cd Backend/node-backend
npm install

cd ../../fundamental-analysis
npm install
```

---

## Environment Variables

### Backend (`Backend/node-backend/.env` and `.env.local`)

`.env` is used in Docker/production. `.env.local` is used when running locally (`NODE_ENV=local`).

```env
PORT=5001
DB_NAME=stocks_data
MONGO_URI=mongodb://admin:secret@localhost:27017/stockanalysis?authSource=admin
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
ANTHROPIC_API_KEY=your-anthropic-api-key
FINNHUB_API_KEY=your-finnhub-api-key
USD_TO_GBP_RATE=0.79
LOG_LEVEL=info
```

For Docker Compose, the `MONGO_URI` should use the container hostname:
```env
MONGO_URI=mongodb://admin:secret@mongo:27017/stockanalysis?authSource=admin
```

### Python Pipeline (`Backend/info-processing/.env` and `.env.local`)

```env
MONGO_URI=mongodb://admin:secret@localhost:27017/stockanalysis?authSource=admin
DB_NAME=stocks_data
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Frontend (`fundamental-analysis/.env`)

```env
REACT_APP_API_URL=http://localhost:5001
```

---

## Running Locally (No Docker)

This mode runs all services natively on your Mac with a local MongoDB instance.

**Step 1 — Start MongoDB**

```bash
brew services start mongodb/brew/mongodb-community
```

Verify it's running:
```bash
brew services list | grep mongodb
```

**Step 2 — Start the Node backend**

```bash
cd Backend/node-backend
NODE_ENV=local node server.js
```

The `NODE_ENV=local` flag tells `dotenv-flow` to load `.env.local` instead of `.env`, which points to `localhost:27017`.

**Step 3 — Start the React frontend**

```bash
cd fundamental-analysis
npm start
```

The app opens at [http://localhost:3000](http://localhost:3000).

**Step 4 — Process company data (optional)**

```bash
cd Backend/info-processing
ENV=local python company_processing_pipeline.py
```

The `ENV=local` flag causes `config.py` to load `.env.local`.

**To stop everything:**

```bash
brew services stop mongodb/brew/mongodb-community
# Ctrl+C the Node and React processes
```

> **Note:** Do not leave MongoDB running when switching to Docker Compose — both will try to bind port 27017 and one will fail.

---

## Running with Docker Compose

Docker Compose spins up three containers: `frontend`, `server`, and `mongo`. All networking between them is handled automatically by Docker.

**Step 1 — Ensure local MongoDB is stopped**

```bash
brew services stop mongodb/brew/mongodb-community
```

**Step 2 — Create the backend `.env` file**

The compose file reads `Backend/node-backend/.env`. Make sure it exists with the Docker Compose `MONGO_URI` (uses `mongo` as the hostname, not `localhost`):

```env
MONGO_URI=mongodb://admin:secret@mongo:27017/stockanalysis?authSource=admin
DB_NAME=stocks_data
PORT=5001
FRONTEND_URL=http://localhost:3000
JWT_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
ANTHROPIC_API_KEY=...
FINNHUB_API_KEY=...
```

**Step 3 — Build and start all containers**

```bash
docker-compose up --build
```

The `--build` flag rebuilds images from the Dockerfiles. Omit it on subsequent runs if no code has changed.

| Service | Port | URL |
|---|---|---|
| React frontend | 3000 | http://localhost:3000 |
| Node API | 5001 | http://localhost:5001 |
| MongoDB | 27017 | (internal) |

**Step 4 — Process data with Docker containers running**

With all containers up, the Python pipeline can connect to the containerised MongoDB at `localhost:27017` (the port is forwarded to your Mac):

```bash
cd Backend/info-processing
python company_processing_pipeline.py
```

> This uses `.env` (not `.env.local`), so make sure `.env` points to `mongodb://admin:secret@localhost:27017/...`.

**To rebuild after code changes:**

```bash
docker-compose down
docker-compose up --build
```

**To stop without destroying data:**

```bash
docker-compose stop
```

**To stop and remove containers (data volume persists):**

```bash
docker-compose down
```

---

## Running on Kubernetes (Minikube)

Minikube simulates a full Kubernetes cluster inside a Docker container on your Mac. All Pods run on a private internal network; `kubectl port-forward` is used to expose them to your Mac for development.

### Secrets Setup

Kubernetes secrets are stored in `*.local.yaml` files which are **gitignored** and never committed. You must create them from the template files before first use.

Copy and fill in the secret files:

```bash
# MongoDB credentials
cp k8s/mongo-secret.yaml k8s/mongo-secret.local.yaml
# Edit mongo-secret.local.yaml and fill in real base64-encoded values

# Node API secrets
cp k8s/server-secret.yaml k8s/server-secret.local.yaml
# Edit server-secret.local.yaml and fill in all env var values
```

To base64-encode a value for a Kubernetes secret:
```bash
echo -n "your-value-here" | base64
```

### Full Kubernetes Setup — Step by Step

**Step 1 — Start Minikube**

```bash
minikube start --driver=docker
```

Verify it's running:
```bash
minikube status
kubectl get nodes
```

Open the dashboard (optional, browser-based UI):
```bash
minikube dashboard
```

**Step 2 — Point your terminal at Minikube's Docker daemon**

```bash
eval $(minikube docker-env)
```

This redirects all `docker` commands in this terminal session to Minikube's internal Docker daemon. Any images you build here will be visible to Kubernetes Pods.

Confirm it worked — you'll see Kubernetes' own internal images, not your Mac's:
```bash
docker images
```

> This setting is **terminal-session-only**. Every new terminal tab starts fresh pointing at your Mac's Docker. Run `eval $(minikube docker-env)` again if needed.

**Step 3 — Build the application images inside Minikube**

```bash
docker compose build frontend server
```

This builds `stockanalysis-frontend:local` and `stockanalysis-server:local` inside Minikube's Docker, where the Kubernetes Pods can find them. The `imagePullPolicy: Never` in the deployment manifests tells Kubernetes to use the locally built image rather than pulling from a registry.

**Step 4 — Apply Kubernetes manifests**

Apply secrets first (from your `.local.yaml` files), then everything else:

```bash
# Secrets (gitignored, contain real credentials)
kubectl apply -f k8s/mongo-secret.local.yaml
kubectl apply -f k8s/server-secret.local.yaml

# MongoDB storage
kubectl apply -f k8s/mongo-pv.yaml
kubectl apply -f k8s/mongo-pvc.yaml

# MongoDB
kubectl apply -f k8s/mongo-deployment.yaml
kubectl apply -f k8s/mongo-service.yaml

# Node API
kubectl apply -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-service.yaml

# React frontend
kubectl apply -f k8s/frontend-secret.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/frontend-service.yaml

# Mongo Express (database browser UI, optional)
kubectl apply -f k8s/mongo-express-deployment.yaml
kubectl apply -f k8s/mongo-express-service.yaml
```

**Step 5 — Wait for all Pods to be Ready**

```bash
kubectl get pods --watch
```

All Pods should reach `Running` status. Press Ctrl+C when done watching.

**Step 6 — Open port-forwards (each in its own terminal tab)**

Port forwarding creates a tunnel from your Mac into a specific Pod. The terminal tab must stay open — closing it closes the tunnel.

First, get Pod names:
```bash
kubectl get pods
```

Then open a dedicated terminal tab for each:

```bash
# Frontend (tab 1)
kubectl port-forward <frontend-pod-name> 3000:3000

# Backend API (tab 2)
kubectl port-forward <server-pod-name> 5001:5001

# MongoDB (tab 3 — needed for the Python pipeline)
kubectl port-forward <mongo-pod-name> 27017:27017

# Mongo Express DB browser (tab 4 — optional)
kubectl port-forward <mongo-express-pod-name> 8081:8081
```

The app is now accessible at [http://localhost:3000](http://localhost:3000).

The Mongo Express browser is at [http://localhost:8081](http://localhost:8081).

**Step 7 — Process company data against Minikube's MongoDB**

With the MongoDB port-forward running:

```bash
cd Backend/info-processing
python company_processing_pipeline.py
```

Use `.env` (not `.env.local`) pointing at `mongodb://admin:secret@localhost:27017/...`.

### Updating Code in Kubernetes

When you change application code, you need to rebuild the image and restart the Pods — applying the manifest again is not enough (it only re-reads the YAML, not the image).

```bash
# 1. Make sure terminal points at Minikube's Docker
eval $(minikube docker-env)

# 2. Rebuild the changed image(s)
docker compose build frontend server   # or just: docker compose build server

# 3. Restart the deployment(s) to pick up the new image
kubectl rollout restart deployment/frontend deployment/server
```

Verify the Pod is using the correct (newest) image:
```bash
kubectl describe pod <pod-name> | grep "Image ID"
docker images   # compare Image IDs
```

### Inspecting MongoDB Inside Kubernetes

Connect directly to the MongoDB Pod with a shell:

```bash
kubectl exec -it <mongo-pod-name> -- mongosh -u admin -p secret --authenticationDatabase admin
```

Replace `<mongo-pod-name>` with the actual name from `kubectl get pods`.

---

## Processing Company Data

The Python pipeline (`company_processing_pipeline.py`) ingests all data for a company into MongoDB. Edit the last line of the file to set the ticker and form types:

```python
form_types = [FormType.TEN_K]
process_company('AAPL', form_types, max_summaries=0)
```

| Parameter | Description |
|---|---|
| `ticker` | Stock ticker symbol (e.g., `'AAPL'`, `'MSFT'`) |
| `form_types` | List of `FormType` values: `TEN_K`, `TEN_Q`, `DEF_14A` |
| `max_summaries` | Max number of AI summaries to generate. `0` = skip all summarization, `None` = summarize all |

The pipeline runs these 6 steps in order:
1. Fetch company info from SEC and save to `companies_list`
2. Fetch XBRL financial metrics and save to `company_financials`
3. Fetch all filing URLs from SEC EDGAR and save to `reports_list`
4. Download filing HTMLs, convert to PDFs, store in MongoDB GridFS
5. Extract text sections from PDFs and (optionally) summarize with Claude
6. Fetch income, balance sheet, and cash flow statements via yfinance

---

## Useful Commands Reference

### MongoDB

```bash
# Start/stop local MongoDB
brew services start mongodb/brew/mongodb-community
brew services stop mongodb/brew/mongodb-community

# Connect to local MongoDB
mongosh -u admin -p secret --authenticationDatabase admin

# Connect to MongoDB inside Kubernetes
kubectl exec -it <mongo-pod-name> -- mongosh -u admin -p secret --authenticationDatabase admin
```

### Docker

```bash
# Build a specific image
docker build -t stock-backend ./Backend/node-backend

# Run a container manually (useful for testing)
docker run -d -p 5001:5001 --name stock-backend-container --env-file .env stock-backend

# View running containers
docker ps

# View logs for a container
docker logs stockanalysis-server
docker logs -f stockanalysis-server   # follow/live

# Remove all stopped containers
docker container prune
```

### Kubernetes / Minikube

```bash
# Cluster status
minikube status
kubectl get nodes
kubectl get pods
kubectl get pods --watch        # live updates

# Pod details and logs
kubectl describe pod <pod-name>
kubectl logs <pod-name>
kubectl logs -f <pod-name>      # follow/live

# Port forward (keep terminal open)
kubectl port-forward <pod-name> <local-port>:<container-port>

# Restart deployments (picks up new images)
kubectl rollout restart deployment/frontend deployment/server

# Apply a single manifest
kubectl apply -f k8s/server-deployment.yaml

# Delete and re-apply a manifest (force recreation)
kubectl delete -f k8s/server-deployment.yaml
kubectl apply -f k8s/server-deployment.yaml

# Stop Minikube (keeps data)
minikube stop

# Delete Minikube cluster entirely (destroys all data)
minikube delete
```

### Node Backend

```bash
# Local dev
NODE_ENV=local node server.js

# View logs (rotated daily)
cat Backend/node-backend/logs/combined-<date>.log
cat Backend/node-backend/logs/error-<date>.log
```

### Python Pipeline

```bash
# Local MongoDB
ENV=local python company_processing_pipeline.py

# Docker or Kubernetes MongoDB (port-forward must be running)
python company_processing_pipeline.py
```

---

For full technical documentation including function-by-function breakdowns, architecture details, and troubleshooting guides, see [DOCUMENTATION.md](DOCUMENTATION.md).
