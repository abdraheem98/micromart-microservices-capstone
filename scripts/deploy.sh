#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${EKS_CLUSTER_NAME:-ms-capstone}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER"

# Require the PostgreSQL connection URL and create/update a Kubernetes Secret.
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL before deploying, e.g. postgresql+psycopg://USER:PASSWORD@RDS_ENDPOINT:5432/micromart" >&2
  exit 1
fi
kubectl create secret generic micromart-db \
  --from-literal=DATABASE_URL="$DATABASE_URL" \
  --dry-run=client -o yaml | kubectl apply -f -

# Replace image placeholders with the current account's ECR registry.
sed "s|REPLACE_ECR|${ECR}|g" k8s/apps.yaml | kubectl apply -f -

kubectl create configmap gateway-config \
  --from-file=default.conf=nginx/default.conf \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f k8s/gateway.yaml

kubectl rollout status deployment/product --timeout=180s
kubectl rollout status deployment/inventory --timeout=180s
kubectl rollout status deployment/orders --timeout=180s
kubectl rollout status deployment/frontend --timeout=180s
kubectl rollout status deployment/gateway --timeout=180s

kubectl get deployments,pods,services
