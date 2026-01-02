#!/bin/bash
# Test RAG and MCP functionality

echo "========================================="
echo "  RAG and MCP Tools Test"
echo "========================================="
echo ""

echo "1. RAG Server Health"
echo "--------------------"
echo "GET /api/rag/health:"
curl -s http://localhost:3002/api/rag/health
echo ""
echo ""

echo "2. RAG Query Test"
echo "----------------"
echo "POST /api/rag/query:"
curl -s -X POST http://localhost:3002/api/rag/query \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"authentication\",\"limit\":3}"
echo ""
echo ""

echo "3. Server Ready Check (includes RAG)"
echo "------------------------------------"
curl -s http://localhost:3001/ready
echo ""
echo ""

echo "4. Team Builder API (Frontend uses this)"
echo "----------------------------------------"
echo "GET /api/team:"
curl -s http://localhost:3001/api/team
echo ""
echo ""

echo "========================================="
echo "  Test Complete!"
echo "========================================="
