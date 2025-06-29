#!/bin/bash
set -e

echo "Staging all changes..."
git add .

echo "Running kodrdriv commit..."
pnpm dlx @eldrforge/kodrdriv commit 