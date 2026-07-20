#!/bin/bash

# =============================================================================
# deploy-frontend.sh — Deployment Script for React on Google Cloud Platform
# =============================================================================
# USAGE:
#   chmod +x deploy-frontend.sh        # First time only
#   ./deploy-frontend.sh               # Deploy with auto tag
#   ./deploy-frontend.sh v1.0.1        # Deploy with specific version
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# SECTION 1: CONFIGURATION
# =============================================================================

PROJECT_ID="ligths-staging"
REGION="asia-south1"
SERVICE_NAME="web-portal-frontend"
REPO_NAME="webportal-repo"

# service account (same as backend)
SERVICE_ACCOUNT_NAME="webportal-runner"
SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# secret name in Secret Manager
BACKEND_URL_SECRET="REACT_APP_WEB_BACKEND_URL"  # ← NEW: name of the secret that holds the backend URL    

IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
APP_PORT=8080

# =============================================================================
# SECTION 2: IMAGE TAG
# =============================================================================

if [ -n "$1" ] && [[ "$1" != --* ]]; then
    IMAGE_TAG="$1"
else
    IMAGE_TAG="rev-$(date +%Y%m%d-%H%M%S)"
fi

FULL_IMAGE="${IMAGE_PATH}:${IMAGE_TAG}"
LATEST_IMAGE="${IMAGE_PATH}:latest"

# =============================================================================
# SECTION 3: HELPER FUNCTIONS
# =============================================================================

print_section() {
    echo ""
    echo "=============================================="
    echo "  $1"
    echo "=============================================="
}

print_success() {
    echo -e "\e[32m✔ $1\e[0m"
}

DEPLOY_START=$(date +%s)

# =============================================================================
# SECTION 4: PRE-DEPLOYMENT CHECKS
# =============================================================================

print_section "Pre-Deployment Checks"

# check gcloud installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found."
    exit 1
fi

# check Dockerfile.frontend exists
if [ ! -f "./Dockerfile.frontend" ]; then
    echo "❌ Dockerfile.frontend not found!"
    exit 1
fi

# check nginx.conf exists
if [ ! -f "./nginx.conf" ]; then
    echo "❌ nginx.conf not found!"
    exit 1
fi

# check gcloud auth
if ! gcloud auth print-access-token &> /dev/null; then
    echo "❌ Not authenticated. Run: gcloud auth login"
    exit 1
fi

# check BACKEND_URL secret exists  ← NEW
if ! gcloud secrets describe "$BACKEND_URL_SECRET" \
    --project="$PROJECT_ID" &> /dev/null; then
    echo "❌ Secret '$BACKEND_URL_SECRET' not found in Secret Manager!"
    echo "   Run: gcloud secrets create BACKEND_URL --project=$PROJECT_ID"
    exit 1
fi

print_success "All pre-deployment checks passed"
echo ""
echo "  Deploying:"
echo "    Service : $SERVICE_NAME"
echo "    Region  : $REGION"
echo "    Image   : $FULL_IMAGE"
echo "    Tag     : $IMAGE_TAG"

# =============================================================================
# SECTION 5: BUILD ON CLOUD BUILD (not local!)
# =============================================================================

print_section "Building React on Cloud Build"

# fetch backend URL from Secret Manager  ← NEW
echo "→ Fetching backend URL from Secret Manager..."
BACKEND_URL=$(gcloud secrets versions access latest \
  --secret="$BACKEND_URL_SECRET" \
  --project="$PROJECT_ID")

if [ -z "$BACKEND_URL" ]; then
    echo "❌ Failed to fetch BACKEND_URL from Secret Manager!"
    exit 1
fi

print_success "Backend URL fetched: $BACKEND_URL"

# build on cloud with backend URL as build arg  ← UPDATED
echo "→ Uploading source to GCP..."
gcloud builds submit \
  --config=cloudbuild-frontend.yaml \
  --project="$PROJECT_ID" \
  --substitutions="_FULL_IMAGE=$FULL_IMAGE,_BACKEND_URL=$BACKEND_URL" \
  .

print_success "React build complete on Cloud Build ☁️"
# =============================================================================
# SECTION 6: DEPLOY TO CLOUD RUN
# =============================================================================

print_section "Deploying to Cloud Run"

gcloud run deploy "$SERVICE_NAME" \
  --image="$FULL_IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --port="$APP_PORT" \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=5 \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --project="$PROJECT_ID"

print_success "Frontend deployed to Cloud Run ✅"

# =============================================================================
# SECTION 7: VERIFY DEPLOYMENT
# =============================================================================

print_section "Verifying Deployment"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform=managed \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)")

echo "→ Service URL: $SERVICE_URL"
echo "→ Sending health check..."

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")

if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Health check passed (HTTP 200) ✅"
else
    echo "⚠ Got HTTP $HTTP_STATUS — check GCP Console"
fi

# =============================================================================
# SECTION 8: SUMMARY
# =============================================================================

DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

print_section "Deployment Summary"

echo ""
echo "  ✅ Frontend deployment successful!"
echo ""
echo "  🌐 Live URL   : $SERVICE_URL"
echo "  🐳 Image      : $FULL_IMAGE"
echo "  🏷  Tag        : $IMAGE_TAG"
echo "  ⏱  Total time : ${ELAPSED}s"
echo ""
echo "  📋 Useful commands:"
echo "    Logs:      gcloud run services logs tail $SERVICE_NAME --region=$REGION"
echo "    Revisions: gcloud run revisions list --service=$SERVICE_NAME --region=$REGION"
echo ""