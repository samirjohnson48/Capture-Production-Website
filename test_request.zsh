#!/bin/zsh

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== FAO Query Test ===${NC}"
echo ""

# Kill any existing Flask process
echo "Cleaning up existing Flask processes..."
pkill -f "flask.*app run" || true
sleep 1

# Clear Python cache
echo "Clearing Python cache..."
find /Users/samirjohnson/Documents/code/FAO/GCP-Website -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

# Start fresh Flask instance
echo "Starting Flask backend..."
cd /Users/samirjohnson/Documents/code/FAO/GCP-Website
python3 -m flask --app backend.app run --port=5000 2>&1 | grep -v "DtypeWarning" &
FLASK_PID=$!
sleep 8  # Wait longer for Flask to load CSVs from GitHub

# Verify Flask is running
if ! kill -0 $FLASK_PID 2>/dev/null; then
    echo "Error: Flask failed to start"
    exit 1
fi

echo -e "${GREEN}✓ Flask started successfully (PID: $FLASK_PID)${NC}"
echo ""

# Run test queries
echo -e "${BLUE}--- Test 1: Number query from 2020 to 2023 ---${NC}"
curl -s -X POST http://127.0.0.1:5000/query \
  -H "Content-Type: application/json" \
  -d '{"min_year": 2020, "max_year": 2023, "Unit": "Number"}' \
  | python3 -m json.tool \
  | head -20

# Clean up
echo ""
echo "Cleaning up Flask process..."
kill $FLASK_PID 2>/dev/null
wait $FLASK_PID 2>/dev/null

echo -e "${GREEN}✓ Tests complete${NC}"