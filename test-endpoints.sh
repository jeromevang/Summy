#!/bin/bash
# Test all enhanced endpoints

echo "======================================"
echo "  Enhanced Endpoints Test Suite"
echo "======================================"
echo ""

BASE_URL="http://localhost:3001"

echo "1. Health Check Endpoints"
echo "-------------------------"
echo "GET /health:"
curl -s $BASE_URL/health | head -3
echo ""
echo "GET /ready:"
curl -s $BASE_URL/ready
echo ""
echo ""

echo "2. Teams API (12 endpoints)"
echo "-------------------------"
echo "GET /api/teams:"
curl -s $BASE_URL/api/teams
echo ""
echo "GET /api/teams/active?projectHash=test123:"
curl -s "$BASE_URL/api/teams/active?projectHash=test123"
echo ""
echo ""

echo "3. Workspace Enhanced API (8 endpoints)"
echo "---------------------------------------"
echo "GET /api/workspace/current:"
curl -s $BASE_URL/api/workspace/current | head -10
echo ""
echo "GET /api/workspace/recent:"
curl -s $BASE_URL/api/workspace/recent | head -5
echo ""
echo "GET /api/workspace/git-status:"
curl -s $BASE_URL/api/workspace/git-status
echo ""
echo "GET /api/workspace/safe-mode:"
curl -s $BASE_URL/api/workspace/safe-mode
echo ""
echo "GET /api/workspace/metadata:"
curl -s $BASE_URL/api/workspace/metadata | head -5
echo ""
echo ""

echo "4. Error Handling Test"
echo "---------------------"
echo "GET /api/nonexistent (404 test):"
curl -s $BASE_URL/api/nonexistent
echo ""
echo ""

echo "======================================"
echo "  Test Complete!"
echo "======================================"
