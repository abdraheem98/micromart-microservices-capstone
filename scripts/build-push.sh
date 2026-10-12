#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ECR"

for svc in product inventory orders; do
  repo="${svc}-service"
  if ! aws ecr describe-repositories --repository-names "$repo" \
      --region "$REGION" >/dev/null 2>&1; then
    aws ecr create-repository --repository-name "$repo" \
      --region "$REGION" >/dev/null
  fi
  docker build --build-arg APP_DIR="$svc" -t "${ECR}/${repo}:latest" .
  docker push "${ECR}/${repo}:latest"
done

if ! aws ecr describe-repositories --repository-names frontend \
    --region "$REGION" >/dev/null 2>&1; then
  aws ecr create-repository --repository-name frontend \
    --region "$REGION" >/dev/null
fi
docker build -f frontend/Dockerfile -t "${ECR}/frontend:latest" ./frontend
docker push "${ECR}/frontend:latest"

echo "ECR=${ECR}"
