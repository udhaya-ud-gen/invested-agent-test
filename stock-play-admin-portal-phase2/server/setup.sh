#!/bin/bash

# =============================================================================
# setup.sh - Initial Setup Script for FastAPI on Google Cloud Platform
# =============================================================================
# PURPOSE:
#   This script runs ONCE to prepare your GCP project environment.
#   It validates required tools, enables GCP APIs, creates infrastructure
#   (Artifact Registry, Cloud Run service account, secrets), and builds
#   the initial Docker image in Cloud Build.
#
# USAGE:
#   chmod +x setup.sh        # First time only
#   ./setup.sh               # Run the setup
#
# PREREQUISITES:
#   - A Google Cloud account with billing enabled
#   - gcloud CLI installed locally (https://cloud.google.com/sdk/docs/install)
#   - Your FastAPI project directory ready with a Dockerfile
# =============================================================================

set -e
set -o pipefail

# =============================================================================
# SECTION 1: CONFIGURATION - Edit these variables before running
# =============================================================================

PROJECT_ID="ligths-staging"
REGION="asia-south1"
SERVICE_NAME="web-portal-backend"
REPO_NAME="webportal-repo"
SERVICE_ACCOUNT_NAME="webportal-runner"
APP_PORT=8080

# =============================================================================
# SECTION 2: HELPER FUNCTIONS
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

# =============================================================================
# SECTION 3: VALIDATE PREREQUISITES
# =============================================================================

print_section "Checking Prerequisites"

if ! command -v gcloud &> /dev/null; then
    echo "[ERROR] gcloud CLI not found. Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi
print_success "gcloud CLI found: $(gcloud --version | head -1)"

if [ "$PROJECT_ID" = "your-gcp-project-id" ]; then
    echo "[ERROR] You must set your PROJECT_ID in setup.sh before running it."
    exit 1
fi

# =============================================================================
# SECTION 4: AUTHENTICATE & SET GCP PROJECT
# =============================================================================

print_section "Authenticating with GCP"

# Add your Python path for gcloud if needed on Git Bash / Windows
echo 'export CLOUDSDK_PYTHON="/c/Users/Dell Lati/AppData/Local/Programs/Python/Python312/python.exe"' >> ~/.bashrc
echo 'export CLOUDSDK_PYTHON_SITEPACKAGES=1' >> ~/.bashrc
source ~/.bashrc

echo "-> Opening browser for Google login..."
gcloud auth login

gcloud config set project "$PROJECT_ID"
print_success "Active project set to: $PROJECT_ID"

gcloud config set run/region "$REGION"
print_success "Default region set to: $REGION"

# =============================================================================
# SECTION 5: ENABLE REQUIRED GCP APIs
# =============================================================================

print_section "Enabling Required GCP APIs"

APIS=(
    "run.googleapis.com"
    "artifactregistry.googleapis.com"
    "cloudbuild.googleapis.com"
    "secretmanager.googleapis.com"
    "iam.googleapis.com"
    "logging.googleapis.com"
)

for API in "${APIS[@]}"; do
    echo "-> Enabling $API ..."
    gcloud services enable "$API" --project="$PROJECT_ID"
    print_success "$API enabled"
done

# =============================================================================
# SECTION 6: CREATE ARTIFACT REGISTRY REPOSITORY
# =============================================================================

print_section "Creating Artifact Registry Repository"

if gcloud artifacts repositories describe "$REPO_NAME" \
    --location="$REGION" \
    --project="$PROJECT_ID" &> /dev/null; then
    print_warning "Repository '$REPO_NAME' already exists - skipping creation."
else
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --project="$PROJECT_ID" \
        --description="Docker images for $SERVICE_NAME FastAPI backend"
    print_success "Artifact Registry repository '$REPO_NAME' created"
fi

IMAGE_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
echo "-> Your image path will be: $IMAGE_PATH"

# =============================================================================
# SECTION 7: CREATE A DEDICATED SERVICE ACCOUNT
# =============================================================================

print_section "Creating Service Account for Cloud Run"

SA_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" \
    --project="$PROJECT_ID" &> /dev/null; then
    print_warning "Service account '$SA_EMAIL' already exists - skipping creation."
else
    gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
        --display-name="FastAPI Cloud Run Runtime Account" \
        --project="$PROJECT_ID"
    print_success "Service account created: $SA_EMAIL"
fi

echo "========================================="
echo "   Checking IAM Roles for Service Account"
echo "========================================="

ROLES_TO_CHECK=(
    "roles/run.invoker"
    "roles/secretmanager.secretAccessor"
    "roles/logging.logWriter"
    "roles/artifactregistry.reader"
)

for ROLE in "${ROLES_TO_CHECK[@]}"; do
    EXISTING=$(gcloud projects get-iam-policy "$PROJECT_ID" \
        --flatten="bindings[].members" \
        --format="value(bindings.role)" \
        --filter="bindings.members:${SA_EMAIL} AND bindings.role:${ROLE}" 2>/dev/null)

    if [ -n "$EXISTING" ]; then
        echo "[OK] $ROLE -> GRANTED"
    else
        echo "[ERROR] $ROLE -> NOT FOUND"
    fi
done

# =============================================================================
# SECTION 8: GRANT IAM ROLES TO SERVICE ACCOUNT
# =============================================================================
# Keep this section commented if roles were granted manually already.

# =============================================================================
# SECTION 9: CREATE SECRETS IN SECRET MANAGER (Optional but Recommended)
# =============================================================================
# Keep this section commented if secrets already exist.

# =============================================================================
# SECTION 10: BUILD & PUSH INITIAL DOCKER IMAGE
# =============================================================================
# This uploads your source to Cloud Build, builds the image in GCP,
# and pushes it to Artifact Registry from Google's Linux build environment.

print_section "Building Initial Docker Image in Cloud Build"

DOCKERFILE_DIR="."

if [ ! -f "${DOCKERFILE_DIR}/Dockerfile" ]; then
    echo "[ERROR] No Dockerfile found in '${DOCKERFILE_DIR}'."
    echo "        Run this script from your project root, or update DOCKERFILE_DIR."
    exit 1
fi

INITIAL_IMAGE="${IMAGE_PATH}:latest"

echo "-> Submitting source to Cloud Build for image: $INITIAL_IMAGE"
gcloud builds submit \
    "$DOCKERFILE_DIR" \
    --tag "$INITIAL_IMAGE" \
    --project "$PROJECT_ID"

print_success "Image built in Cloud Build and pushed: $INITIAL_IMAGE"

# =============================================================================
# SECTION 11: INITIAL CLOUD RUN DEPLOYMENT
# =============================================================================

print_section "Deploying Initial Cloud Run Service"

gcloud run deploy "$SERVICE_NAME" \
    --image="$INITIAL_IMAGE" \
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
    --project="$PROJECT_ID"

print_success "Cloud Run service '$SERVICE_NAME' deployed!"

# =============================================================================
# SECTION 12: OUTPUT SUMMARY
# =============================================================================

print_section "Setup Complete!"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --platform=managed \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format="value(status.url)")

echo ""
echo "  [OK] Your FastAPI backend is live at:"
echo "     $SERVICE_URL"
echo ""
echo "  Docker Image Path:"
echo "     $IMAGE_PATH"
echo ""
echo "  Service Account:"
echo "     $SA_EMAIL"
echo ""
echo "  Useful Commands:"
echo "     View logs:  gcloud run services logs read $SERVICE_NAME --region=$REGION"
echo "     Describe:   gcloud run services describe $SERVICE_NAME --region=$REGION"
echo "     Next step:  Run ./deploy.sh for future deployments"
echo ""
