#!/usr/bin/env bash
set -euo pipefail
REGION="${AWS_REGION:-us-east-1}"
CLUSTER="${EKS_CLUSTER_NAME:-ms-capstone}"

aws sts get-caller-identity >/dev/null
eksctl create cluster \
  --name "$CLUSTER" \
  --region "$REGION" \
  --nodegroup-name capstone-workers \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 2 \
  --managed

aws eks update-kubeconfig --region "$REGION" --name "$CLUSTER"
kubectl get nodes
