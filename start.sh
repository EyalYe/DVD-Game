#!/bin/bash
cd backend && npm install
cd ../frontend && npm install
echo "Starting backend..."
cd ../backend && npm start &
echo "Starting frontend..."
cd ../frontend && npm run start
