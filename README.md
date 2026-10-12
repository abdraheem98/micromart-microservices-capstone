# MicroMart — Microservices Capstone on Amazon EKS

A small, repository-ready capstone for a two-hour trainer-led lab. It is intentionally separate from the Cloud Inventory three-tier application.

## What you'll deploy

- **Product Service** — product catalogue (`/`)
- **Inventory Service** — stock lookup and reservation (`/stock/{product_id}`, `/reserve`)
- **Order Service** — creates orders and calls Inventory over HTTP (`/orders`)
- **React + Vite frontend** — dashboard for catalogue, stock, and orders
- **Nginx gateway** — one public entry point routing UI and API requests
- **Amazon ECR** — stores the three application images
- **Amazon EKS** — runs Kubernetes Deployments and Services
- **Kubernetes probes** — readiness and liveness checks

The Product, Inventory, and Orders services persist their own tables in one PostgreSQL database. Local development defaults to SQLite so you can test without provisioning AWS first. For EKS, configure `DATABASE_URL` to point to Amazon RDS for PostgreSQL. Local default uses SQLite in a file so no local PostgreSQL install is required. This is a training demo, not production order processing.

## Architecture

```mermaid
flowchart TD
    Client --> Gateway[Nginx Gateway]
    Gateway --> Product[Product Service]
    Gateway --> Inventory[Inventory Service]
    Gateway --> Orders[Order Service]
    Orders -->|HTTP via Kubernetes DNS| Inventory
```

## Repository layout

```text
micromart-microservices-capstone/
├── frontend/                 # React + Vite dashboard and static web container
├── services/
│   ├── product/app.py
│   ├── inventory/app.py
│   └── orders/app.py
├── Dockerfile
├── requirements.txt
├── .env.example
├── k8s/
│   ├── apps.yaml
│   └── gateway.yaml
├── nginx/default.conf
├── scripts/
│   ├── create-cluster.sh
│   ├── build-push.sh
│   └── deploy.sh
└── README.md
```

## Prerequisites

On the trainer's machine: AWS CLI v2, Docker, `kubectl`, and `eksctl`; an AWS identity allowed to create EKS, EC2/VPC resources, IAM roles, ECR repositories, and load balancers. Docker must be running.

Default region: `us-east-1`. Check AWS identity and tools before the timed lab:

```bash
aws sts get-caller-identity
aws --version
docker --version
kubectl version --client
eksctl version
```

## Two-hour teaching plan

1. **0–10 min:** Explain architecture and inspect repository.
2. **10–25 min:** Start cluster creation in Terminal A.
3. **25–45 min:** Build and push images in Terminal B while EKS provisions.
4. **45–70 min:** Deploy services and verify pod readiness.
5. **70–90 min:** Deploy gateway and wait for its external address.
6. **90–110 min:** Test product, stock, successful order, insufficient stock, and failure recovery.
7. **110–120 min:** Capture evidence and discuss production improvements.

Cluster provisioning can exceed the planned time depending on AWS capacity and permissions. Prepare AWS access and tools before class.

## Frontend UI

The `frontend/` directory contains a React + Vite dashboard with product catalogue, stock visibility, order creation, recent orders, loading/error states, and a refresh action. It is deployed as its own Kubernetes Deployment and ClusterIP Service. The public Nginx gateway sends `/products/`, `/inventory/`, and `/orders/` to the APIs and all other paths to the frontend. The frontend's Nginx also proxies the API paths for in-cluster requests.

## Run the full application locally (before AWS)

Open four terminals from the repository root.

### Terminal 1 — Product API

```bash
python -m pip install -r requirements.txt
uvicorn app:app --app-dir services/product --host 127.0.0.1 --port 8001
```

### Terminal 2 — Inventory API

```bash
uvicorn app:app --app-dir services/inventory --host 127.0.0.1 --port 8002
```

### Terminal 3 — Order API

```bash
INVENTORY_URL=http://127.0.0.1:8002 uvicorn app:app --app-dir services/orders --host 127.0.0.1 --port 8003
```

On Windows PowerShell, set the environment variable before starting Uvicorn:

```powershell
$env:INVENTORY_URL="http://127.0.0.1:8002"
python -m uvicorn app:app --app-dir services/orders --host 127.0.0.1 --port 8003
```

### Terminal 4 — React UI

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`. `frontend/vite.config.js` proxies the UI's API requests to the three local FastAPI services, so no CORS configuration is needed for this test.

Check the APIs directly if the dashboard shows an error:

```bash
curl http://127.0.0.1:8001/health
curl http://127.0.0.1:8002/health
curl http://127.0.0.1:8003/health
```

Local mode uses a persistent SQLite file (`micromart.db`) by default. Copy `.env.example` to `.env` if you want to customize `DATABASE_URL`. Keep all three backend terminals running while using the UI. Tables are created automatically at service startup and seed data is inserted only when the relevant table is empty.

## Database setup for EKS (Amazon RDS for PostgreSQL)

Create an RDS PostgreSQL database in a VPC reachable from the EKS worker nodes/pods. For the two-hour lab, use a single database named `micromart`; each service owns its own table (`products`, `inventory`, or `orders`). Do not make RDS publicly accessible for the capstone. Configure its security group to allow TCP 5432 only from the EKS security group. Confirm DNS/network access from the cluster and create the database before deployment.

Set the connection URL in the shell where you run the deployment script. Use a URL-encoded password if it contains characters such as `@`, `:`, `/`, or `#`.

```bash
export DATABASE_URL='postgresql+psycopg://DB_USER:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/micromart'
```

PowerShell:

```powershell
$env:DATABASE_URL = "postgresql+psycopg://DB_USER:URL_ENCODED_PASSWORD@RDS_ENDPOINT:5432/micromart"
```

`scripts/deploy.sh` stores this value in Kubernetes Secret `micromart-db` and injects it into the three backend Deployments. Never commit a real `.env` or put database credentials in the Kubernetes YAML. Table creation and demo seeding run automatically at service startup. This simple demo uses one shared RDS database but each service writes only to its own table; production systems should consider stronger database-per-service ownership and migration tooling.

## Step 1 — Create the EKS cluster

From the repository root:

```bash
chmod +x scripts/*.sh
./scripts/create-cluster.sh
```

This uses `eksctl` to create a new EKS cluster named `ms-capstone` with two `t3.medium` managed worker nodes. Review AWS costs before running. It is not guaranteed to finish within a fixed duration.

## Step 2 — Build and push four images to ECR

Run while cluster creation is in progress:

```bash
./scripts/build-push.sh
```

The script creates ECR repositories if needed and pushes `product-service`, `inventory-service`, `orders-service`, and `frontend`, tagged `latest`.

## Step 3 — Connect kubectl and deploy

After cluster creation completes, ensure `DATABASE_URL` is set as described in the RDS section, then run the deployment script. It creates/updates the database Secret, applies all app manifests and the gateway, and waits for rollout:

```bash
./scripts/deploy.sh
```

Verify the workloads:

```bash
kubectl get deployments,pods,services
kubectl logs deployment/product --tail=30
kubectl logs deployment/inventory --tail=30
kubectl logs deployment/orders --tail=30
```

## Step 4 — Deploy the gateway

```bash
kubectl create configmap gateway-config \
  --from-file=default.conf=nginx/default.conf \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f k8s/gateway.yaml
kubectl rollout status deployment/gateway
kubectl get svc gateway -w
```

Wait for `EXTERNAL-IP`/hostname, then press `Ctrl+C`. Some AWS environments require the AWS Load Balancer Controller or compatible cloud-provider integration for `Service type=LoadBalancer`; if the address stays pending, inspect `kubectl describe svc gateway` and cluster events. Do not spend the whole lab troubleshooting infrastructure—use port-forward as a fallback.

## Step 5 — Test the application

Get the public gateway hostname:

```bash
export LB=$(kubectl get svc gateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
export BASE_URL="http://${LB}"
echo "$BASE_URL"
```

If AWS returns an IP instead of a hostname, use the external IP as `BASE_URL`.

```bash
curl -i "$BASE_URL/health"
curl -s "$BASE_URL/products/"
curl -s "$BASE_URL/inventory/stock/1"
```

Create an order:

```bash
curl -i -X POST "$BASE_URL/orders/orders" \
  -H 'Content-Type: application/json' \
  -d '{"product_id":1,"quantity":2}'
```

Stock should fall from 10 to 8:

```bash
curl -s "$BASE_URL/inventory/stock/1"
```

Try an order exceeding available stock; expected response is `409 Conflict`:

```bash
curl -i -X POST "$BASE_URL/orders/orders" \
  -H 'Content-Type: application/json' \
  -d '{"product_id":1,"quantity":100}'
```

## Step 6 — Demonstrate service failure and recovery

```bash
kubectl scale deployment/inventory --replicas=0
```

Retry an order. The Order Service should return `503` when Inventory cannot be reached. Restore the service:

```bash
kubectl scale deployment/inventory --replicas=1
kubectl rollout status deployment/inventory
kubectl get pods
```

Inspect logs:

```bash
kubectl logs deployment/orders --tail=50
kubectl logs deployment/inventory --tail=50
kubectl logs deployment/gateway --tail=50
```

## Evidence checklist

- [ ] EKS nodes in `Ready` state
- [ ] Three Deployments and three internal ClusterIP Services
- [ ] Gateway endpoint and health response
- [ ] Product and stock lookup responses
- [ ] Successful order and stock decrement
- [ ] Insufficient-stock rejection
- [ ] Inventory outage and recovery evidence
- [ ] Pod and application logs

## Design limitations to discuss

- One shared database instance is used for training speed; each service owns a separate table.
- No migration framework, authentication, TLS, or production-grade distributed transaction/outbox model is implemented.
- The gateway is a simple Nginx reverse proxy, not an Ingress Controller.
- Production follow-up: persistent storage, idempotency, authentication, resource requests/limits, HPA, network policies, secrets management, TLS, CI/CD, and multi-AZ resilience.

## Cleanup

Remove the gateway Service first so AWS can delete its load balancer, then delete the cluster:

```bash
kubectl delete service gateway
eksctl delete cluster --name ms-capstone --region us-east-1
```

ECR repositories and images are separate resources and may continue to incur storage charges. Remove them if no longer required.
