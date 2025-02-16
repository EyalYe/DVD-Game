#!/bin/bash

echo "🔍 Checking project structure and file contents..."

# Set the project root
PROJECT_ROOT="$(pwd)"

# List all files in the project
echo -e "\n📂 Project File Tree:"
find "$PROJECT_ROOT" -type f | sed "s|$PROJECT_ROOT/|  |"

# Show contents of key files
show_file_content() {
    if [ -f "$1" ]; then
        echo -e "\n📄 Content of $1:\n"
        cat "$1"
    else
        echo -e "\n❌ File not found: $1"
    fi
}

# Check frontend files
show_file_content "frontend/public/index.html"
show_file_content "frontend/src/index.jsx"
show_file_content "frontend/src/App.jsx"
show_file_content "frontend/vite.config.js"
show_file_content "frontend/package.json"

# Check backend files (if any)
show_file_content "backend/server.js"
show_file_content "backend/package.json"

# Check if Vite is running
echo -e "\n🚀 Checking if Vite is running..."
if pgrep -f "vite" > /dev/null; then
    echo "✅ Vite is running!"
else
    echo "❌ Vite is NOT running!"
fi

# Check if the frontend is serving content
echo -e "\n🌐 Testing localhost:5173 response..."
curl -I http://localhost:5173/

echo -e "\n✅ Debugging complete!"
