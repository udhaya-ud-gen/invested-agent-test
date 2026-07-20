#!/bin/bash

# =============================================================================
# deploy.sh - Deployment Script for FastAPI on Google Cloud Platform
# =============================================================================
# PURPOSE:
#   This script is used for every deployment AFTER the initial setup.sh run.
#   It builds a new versioned Docker image in Cloud Build, pushes it to
#   Artifact Registry, deploys it to Cloud Run, verifies the deployment,
#   and optionally cleans up old images to control storage costs.
#
# USAGE:
#   chmod +x deploy.sh               # First time only
#   ./deploy.sh                      # Deploy with auto-generated tag (timestamp)
#   ./deploy.sh v1.2.3               # Deploy with a specific version tag
#   ./deploy.sh v1.2.3 --no-cleanup  # Deploy without deleting old images
#
# WHEN TO USE THIS vs setup.sh:
#   setup.sh  -> Run ONCE to create GCP infrastructure from scratch
#   deploy.sh -> Run EVERY TIME you want to push a new version of your app
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# SECTION 1: CONFIGURATION
# =============================================================================

PROJECT_ID="ligths-staging"
REGION="asia-south1"
SERVICE_NAME="web-portal-backend"
REPO_NAME="webportal-repo"
SERVICE_ACCOUNT_NAME="webportal-runner"
SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
APP_PORT=8080
KEEP_IMAGES=3

# Add your Python path for gcloud if needed on Git Bash / Windows
echo 'export CLOUDSDK_PYTHON="/c/Users/Dell Lati/AppData/Local/Programs/Python/Python312/python.exe"' >> ~/.bashrc
echo 'export CLOUDSDK_PYTHON_SITEPACKAGES=1' >> ~/.bashrc
source ~/.bashrc

# =============================================================================
# SECTION 2: PARSE ARGUMENTS
# =============================================================================

if [ -n "$1" ] && [[ "$1" != --* ]]; then
    IMAGE_TAG="$1"
    shift
else
    IMAGE_TAG="rev-$(date +%Y%m%d-%H%M%S)"
fi

SKIP_CLEANUP=false
for arg in "$@"; do
    if [ "$arg" = "--no-cleanup" ]; then
        SKIP_CLEANUP=true
    fi
done

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
    echo -e "\e[32m[OK] $1\e[0m"
}

print_warning() {
    echo -e "\e[33m[WARN] $1\e[0m"
}

DEPLOY_START=$(date +%s)

# =============================================================================
# SECTION 4: PRE-DEPLOYMENT CHECKS
# =============================================================================

print_section "Pre-Deployment Checks"

if ! command -v gcloud &> /dev/null; then
    echo "[ERROR] gcloud CLI not found. Run setup.sh first."
    exit 1
fi

if [ ! -f "./Dockerfile" ]; then
    echo "[ERROR] No Dockerfile found in the current directory."
    echo "        Run this script from your project root (same folder as Dockerfile)."
    exit 1
fi

if ! gcloud auth print-access-token &> /dev/null; then
    echo "[ERROR] Not authenticated with gcloud. Run: gcloud auth login"
    exit 1
fi

if ! gcloud projects describe "$PROJECT_ID" &> /dev/null; then
    echo "[ERROR] Cannot access GCP project '$PROJECT_ID'."
    echo "        Check PROJECT_ID or run: gcloud config set project $PROJECT_ID"
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
# SECTION 5: BUILD DOCKER IMAGE
# =============================================================================
# Build the image in Cloud Build so the container is created in a Linux
# environment instead of on the local machine.

print_section "Building Docker Image in Cloud Build"

echo "-> Building $FULL_IMAGE in Cloud Build ..."
gcloud builds submit \
  . \
  --tag "$FULL_IMAGE" \
  --project "$PROJECT_ID"
print_success "Docker image built in Cloud Build and pushed successfully"

# =============================================================================
# SECTION 6: UPDATE LATEST TAG IN ARTIFACT REGISTRY
# =============================================================================
# Cloud Build already pushed the versioned image.
# Update :latest so it points to the newest pushed image.

print_section "Updating Latest Tag in Artifact Registry"

echo "-> Pointing latest tag to: $FULL_IMAGE"
gcloud artifacts docker tags add \
  "$FULL_IMAGE" \
  "$LATEST_IMAGE" \
  --project "$PROJECT_ID"

print_success "Artifact Registry tags updated"

# =============================================================================
# SECTION 7: DEPLOY TO CLOUD RUN
# =============================================================================

print_section "Deploying to Cloud Run"

echo "-> Deploying revision with image tag: $IMAGE_TAG"

gcloud run deploy "$SERVICE_NAME" \
  --image="$FULL_IMAGE" \
  --platform=managed \
  --region="$REGION" \
  --service-account="$SA_EMAIL" \
  --port="$APP_PORT" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --timeout=300 \
  --concurrency=80 \
  --allow-unauthenticated \
  --set-secrets="MONGODBWEB_URI=MONGODBWEB_URI:latest,SECRET_KEY=SECRET_KEY:latest" \
  --tag="$IMAGE_TAG" \
  --project="$PROJECT_ID"

print_success "Cloud Run deployment complete"

# =============================================================================
# SECTION 8: VERIFY DEPLOYMENT
# =============================================================================

print_section "Verifying Deployment"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform=managed \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)")

echo "-> Service URL: $SERVICE_URL"
echo "-> Sending health check request..."

HEALTH_URL="${SERVICE_URL}/health"
MAX_RETRIES=5
RETRY_DELAY=5
HTTP_STATUS=0

for i in $(seq 1 $MAX_RETRIES); do
    echo "   Attempt $i/$MAX_RETRIES..."
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
        "$HEALTH_URL" 2>/dev/null || echo "000")

    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "404" ]; then
        break
    fi

    echo "   Got HTTP $HTTP_STATUS - waiting $RETRY_DELAY seconds..."
    sleep $RETRY_DELAY
done

if [ "$HTTP_STATUS" = "200" ]; then
    print_success "Health check passed (HTTP 200)"
elif [ "$HTTP_STATUS" = "404" ]; then
    print_warning "Service is live (HTTP 404 - consider adding a /health endpoint to your FastAPI app)"
else
    echo "[ERROR] Health check failed after $MAX_RETRIES attempts (HTTP $HTTP_STATUS)"
    echo "        Check logs: gcloud run services logs read $SERVICE_NAME --region=$REGION"
    exit 1
fi

# =============================================================================
# SECTION 9: CLEANUP OLD DOCKER IMAGES
# =============================================================================

# if [ "$SKIP_CLEANUP" = false ] && [ "$KEEP_IMAGES" -gt 0 ]; then
#     print_section "Cleaning Up Old Images (keeping latest $KEEP_IMAGES)"
#
#     ALL_DIGESTS=$(gcloud artifacts docker images list \
#         "${IMAGE_PATH}" \
#         --sort-by="CREATE_TIME" \
#         --format="value(version)" \
#         --project="$PROJECT_ID" 2>/dev/null || echo "")
#
#     if [ -z "$ALL_DIGESTS" ]; then
#         print_warning "Could not list images - skipping cleanup."
#     else
#         TOTAL=$(echo "$ALL_DIGESTS" | wc -l | tr -d ' ')
#         DELETE_COUNT=$((TOTAL - KEEP_IMAGES))
#
#         if [ "$DELETE_COUNT" -le 0 ]; then
#             print_success "Only $TOTAL image(s) found - no cleanup needed."
#         else
#             echo "-> Found $TOTAL images; deleting $DELETE_COUNT oldest..."
#             echo "$ALL_DIGESTS" | head -n "$DELETE_COUNT" | while read -r DIGEST; do
#                 echo "   Deleting $DIGEST ..."
#                 gcloud artifacts docker images delete \
#                     "${IMAGE_PATH}@${DIGEST}" \
#                     --quiet \
#                     --project="$PROJECT_ID" || print_warning "Could not delete $DIGEST - skipping."
#             done
#             print_success "Old images cleaned up"
#         fi
#     fi
# else
#     print_warning "Image cleanup skipped (SKIP_CLEANUP=$SKIP_CLEANUP, KEEP_IMAGES=$KEEP_IMAGES)"
# fi

# =============================================================================
# SECTION 10: ROLLBACK INSTRUCTIONS
# =============================================================================

print_section "Rollback Instructions (For Reference)"

echo "  If this deployment has issues, roll back with:"
echo ""
echo "  gcloud run revisions list --service=$SERVICE_NAME --region=$REGION"
echo ""
echo "  gcloud run services update-traffic $SERVICE_NAME \\"
echo "    --to-revisions=REVISION_NAME=100 \\"
echo "    --region=$REGION"
echo ""
echo "  gcloud run deploy $SERVICE_NAME \\"
echo "    --image=${IMAGE_PATH}:PREVIOUS_TAG \\"
echo "    --region=$REGION"

# =============================================================================
# SECTION 11: DEPLOYMENT SUMMARY
# =============================================================================

DEPLOY_END=$(date +%s)
ELAPSED=$((DEPLOY_END - DEPLOY_START))

print_section "Deployment Summary"

echo ""
echo "  [OK] Deployment successful!"
echo ""
echo "  Live URL    : $SERVICE_URL"
echo "  Image       : $FULL_IMAGE"
echo "  Tag         : $IMAGE_TAG"
echo "  Total time  : ${ELAPSED}s"
echo ""
echo "  Useful commands:"
echo "    Logs (live):   gcloud run services logs tail $SERVICE_NAME --region=$REGION"
echo "    Logs (recent): gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo "    Revisions:     gcloud run revisions list --service=$SERVICE_NAME --region=$REGION"
echo ""
