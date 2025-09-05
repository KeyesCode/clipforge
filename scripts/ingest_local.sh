#!/bin/bash

# ClipForge Local Ingestion Script
# Usage: ./scripts/ingest_local.sh <video_url> [streamer_name] [options]
# 
# This script provides a convenient way to trigger video ingestion locally
# for testing and development purposes.

set -e

# Default configuration
ORCHESTRATOR_URL="http://localhost:3000"
DEFAULT_STREAMER="test_streamer"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
ClipForge Local Ingestion Script

USAGE:
    $0 <video_url> [streamer_name] [options]

ARGUMENTS:
    video_url       YouTube/Twitch URL or local video file path
    streamer_name   Name of the streamer (default: $DEFAULT_STREAMER)

OPTIONS:
    -h, --help      Show this help message
    -u, --url       Orchestrator URL (default: $ORCHESTRATOR_URL)
    -c, --check     Check system status before ingestion
    -w, --wait      Wait for processing to complete
    -v, --verbose   Verbose output
    --dry-run       Show what would be done without executing

EXAMPLES:
    # Ingest a YouTube video
    $0 "https://www.youtube.com/watch?v=dQw4w9WgXcQ" "rick_astley"
    
    # Ingest with status checking
    $0 "https://twitch.tv/videos/123456789" "ninja" --check --wait
    
    # Dry run to see what would happen
    $0 "/path/to/local/video.mp4" "local_test" --dry-run

ENVIRONMENT VARIABLES:
    ORCHESTRATOR_URL    Override default orchestrator URL
    CLIPFORGE_API_KEY   API key for authentication (if required)

EOF
}

# Function to check if orchestrator is running
check_orchestrator() {
    print_status "Checking orchestrator status at $ORCHESTRATOR_URL..."
    
    if curl -s -f "$ORCHESTRATOR_URL/health" > /dev/null 2>&1; then
        print_success "Orchestrator is running"
        return 0
    else
        print_error "Orchestrator is not accessible at $ORCHESTRATOR_URL"
        print_status "Make sure Docker Compose is running: cd $PROJECT_ROOT/deploy && docker compose up -d"
        return 1
    fi
}

# Function to check system status
check_system_status() {
    print_status "Checking system status..."
    
    # Check orchestrator
    if ! check_orchestrator; then
        return 1
    fi
    
    # Check services via orchestrator
    local status_response
    status_response=$(curl -s "$ORCHESTRATOR_URL/api/system/status" 2>/dev/null || echo '{"error": "failed"}')
    
    if echo "$status_response" | grep -q '"status":"healthy"'; then
        print_success "All services are healthy"
    else
        print_warning "Some services may not be ready"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
        fi
    fi
}

# Function to validate video URL
validate_video_url() {
    local url="$1"
    
    if [[ -f "$url" ]]; then
        print_status "Local file detected: $url"
        if [[ ! -r "$url" ]]; then
            print_error "File is not readable: $url"
            return 1
        fi
        return 0
    fi
    
    if [[ "$url" =~ ^https?://(www\.)?(youtube\.com|youtu\.be|twitch\.tv) ]]; then
        print_status "Valid streaming URL detected: $url"
        return 0
    fi
    
    print_error "Invalid video URL or file path: $url"
    print_status "Supported: YouTube, Twitch URLs, or local file paths"
    return 1
}

# Function to create streamer if not exists
ensure_streamer() {
    local streamer_name="$1"
    
    print_status "Ensuring streamer '$streamer_name' exists..."
    
    local streamer_data="{
        \"name\": \"$streamer_name\",
        \"platform\": \"youtube\",
        \"channelId\": \"auto_detected\",
        \"displayName\": \"$streamer_name\",
        \"isActive\": true
    }"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would create/update streamer: $streamer_name"
        return 0
    fi
    
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$streamer_data" \
        "$ORCHESTRATOR_URL/api/streamers" 2>/dev/null || echo '{"error": "failed"}')
    
    if echo "$response" | grep -q '"id"'; then
        print_success "Streamer '$streamer_name' is ready"
    else
        print_warning "Could not create/verify streamer (may already exist)"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        fi
    fi
}

# Function to trigger ingestion
trigger_ingestion() {
    local video_url="$1"
    local streamer_name="$2"
    
    print_status "Triggering ingestion for: $video_url"
    
    local ingestion_data="{
        \"url\": \"$video_url\",
        \"streamerName\": \"$streamer_name\",
        \"priority\": \"high\",
        \"options\": {
            \"generateClips\": true,
            \"maxDuration\": 7200,
            \"chunkSize\": 300
        }
    }"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_status "[DRY RUN] Would trigger ingestion with data:"
        echo "$ingestion_data" | jq '.' 2>/dev/null || echo "$ingestion_data"
        return 0
    fi
    
    local response
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$ingestion_data" \
        "$ORCHESTRATOR_URL/api/streams/ingest" 2>/dev/null || echo '{"error": "failed"}')
    
    if echo "$response" | grep -q '"jobId"'; then
        local job_id
        job_id=$(echo "$response" | jq -r '.jobId' 2>/dev/null || echo "unknown")
        print_success "Ingestion started! Job ID: $job_id"
        
        if [[ "$WAIT_FOR_COMPLETION" == "true" ]]; then
            wait_for_job "$job_id"
        else
            print_status "Monitor progress at: $ORCHESTRATOR_URL/jobs/$job_id"
        fi
    else
        print_error "Failed to start ingestion"
        if [[ "$VERBOSE" == "true" ]]; then
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        fi
        return 1
    fi
}

# Function to wait for job completion
wait_for_job() {
    local job_id="$1"
    
    if [[ "$job_id" == "unknown" ]]; then
        print_warning "Cannot wait for job with unknown ID"
        return 1
    fi
    
    print_status "Waiting for job $job_id to complete..."
    
    local max_attempts=120  # 10 minutes with 5-second intervals
    local attempt=0
    
    while [[ $attempt -lt $max_attempts ]]; do
        local status_response
        status_response=$(curl -s "$ORCHESTRATOR_URL/api/jobs/$job_id" 2>/dev/null || echo '{"status": "unknown"}')
        
        local status
        status=$(echo "$status_response" | jq -r '.status' 2>/dev/null || echo "unknown")
        
        case "$status" in
            "completed")
                print_success "Job completed successfully!"
                if [[ "$VERBOSE" == "true" ]]; then
                    echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
                fi
                return 0
                ;;
            "failed")
                print_error "Job failed!"
                if [[ "$VERBOSE" == "true" ]]; then
                    echo "$status_response" | jq '.' 2>/dev/null || echo "$status_response"
                fi
                return 1
                ;;
            "cancelled")
                print_warning "Job was cancelled"
                return 1
                ;;
            "processing")
                print_status "Job is still processing... (attempt $((attempt + 1))/$max_attempts)"
                ;;
            *)
                print_status "Job status: $status (attempt $((attempt + 1))/$max_attempts)"
                ;;
        esac
        
        sleep 5
        ((attempt++))
    done
    
    print_warning "Timeout waiting for job completion"
    return 1
}

# Parse command line arguments
VIDEO_URL=""
STREAMER_NAME="$DEFAULT_STREAMER"
CHECK_STATUS="false"
WAIT_FOR_COMPLETION="false"
VERBOSE="false"
DRY_RUN="false"

# Override from environment
if [[ -n "$ORCHESTRATOR_URL" ]]; then
    ORCHESTRATOR_URL="$ORCHESTRATOR_URL"
fi

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -u|--url)
            ORCHESTRATOR_URL="$2"
            shift 2
            ;;
        -c|--check)
            CHECK_STATUS="true"
            shift
            ;;
        -w|--wait)
            WAIT_FOR_COMPLETION="true"
            shift
            ;;
        -v|--verbose)
            VERBOSE="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -*)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [[ -z "$VIDEO_URL" ]]; then
                VIDEO_URL="$1"
            elif [[ -z "$STREAMER_NAME" || "$STREAMER_NAME" == "$DEFAULT_STREAMER" ]]; then
                STREAMER_NAME="$1"
            else
                print_error "Too many arguments: $1"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$VIDEO_URL" ]]; then
    print_error "Video URL is required"
    show_usage
    exit 1
fi

# Main execution
main() {
    print_status "ClipForge Local Ingestion Script"
    print_status "Video URL: $VIDEO_URL"
    print_status "Streamer: $STREAMER_NAME"
    print_status "Orchestrator: $ORCHESTRATOR_URL"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        print_warning "DRY RUN MODE - No actual changes will be made"
    fi
    
    # Validate video URL
    if ! validate_video_url "$VIDEO_URL"; then
        exit 1
    fi
    
    # Check system status if requested
    if [[ "$CHECK_STATUS" == "true" ]]; then
        if ! check_system_status; then
            exit 1
        fi
    fi
    
    # Ensure orchestrator is accessible
    if ! check_orchestrator; then
        exit 1
    fi
    
    # Ensure streamer exists
    ensure_streamer "$STREAMER_NAME"
    
    # Trigger ingestion
    if ! trigger_ingestion "$VIDEO_URL" "$STREAMER_NAME"; then
        exit 1
    fi
    
    print_success "Ingestion process initiated successfully!"
    
    if [[ "$WAIT_FOR_COMPLETION" != "true" && "$DRY_RUN" != "true" ]]; then
        print_status "Use --wait flag to monitor completion, or check the web UI at:"
        print_status "$ORCHESTRATOR_URL"
    fi
}

# Check for required tools
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        print_warning "jq not found - JSON output will be raw"
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        print_status "Install with: sudo apt-get install ${missing_deps[*]} (Ubuntu/Debian)"
        print_status "Or: brew install ${missing_deps[*]} (macOS)"
        exit 1
    fi
}

# Run dependency check and main function
check_dependencies
main "$@"