#!/bin/bash
set -e

# Run Artillery load test
# Usage: ./run-load-test.sh [target-url]

TARGET_URL=${1:-https://pardonsimulator.com}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOAD_TEST_DIR="$SCRIPT_DIR/../tests/load"
REPORTS_DIR="$SCRIPT_DIR/../reports/load-tests"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0;m' # No Color

echo "========================================="
echo "Running Load Test"
echo "Target: $TARGET_URL"
echo "========================================="

# Check if Artillery is installed
if ! command -v artillery &> /dev/null; then
    echo -e "${RED}Artillery is not installed${NC}"
    echo "Install it with: npm install -g artillery"
    exit 1
fi

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Generate report filename with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REPORT_FILE="$REPORTS_DIR/load-test-${TIMESTAMP}.json"
HTML_REPORT="$REPORTS_DIR/load-test-${TIMESTAMP}.html"

echo -e "\n${YELLOW}Starting load test...${NC}"
echo "This will take approximately 40 minutes (warm-up + ramp-up + sustained + cool-down)"

# Run Artillery test
cd "$LOAD_TEST_DIR"

artillery run \
    --target "$TARGET_URL" \
    --output "$REPORT_FILE" \
    artillery.yml

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✓ Load test completed${NC}"
else
    echo -e "\n${RED}✗ Load test failed${NC}"
    exit 1
fi

# Generate HTML report
echo -e "\n${YELLOW}Generating HTML report...${NC}"

artillery report "$REPORT_FILE" --output "$HTML_REPORT"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Report generated${NC}"
    echo "Report: $HTML_REPORT"
else
    echo -e "${RED}✗ Failed to generate report${NC}"
fi

# Display summary
echo -e "\n${GREEN}=========================================${NC}"
echo -e "${GREEN}Load Test Summary${NC}"
echo -e "${GREEN}=========================================${NC}"

# Extract key metrics from report
artillery report "$REPORT_FILE" | grep -E "(http.codes|http.response_time|errors)" || true

echo -e "\n${YELLOW}Files:${NC}"
echo "JSON Report: $REPORT_FILE"
echo "HTML Report: $HTML_REPORT"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Open HTML report in browser: open $HTML_REPORT"
echo "2. Review CloudWatch metrics in AWS Console"
echo "3. Check ECS task logs for errors"
echo "4. Analyze pool distribution in database"
echo "5. If issues found, optimize and re-test"

echo -e "\n${GREEN}Load test complete!${NC}"














