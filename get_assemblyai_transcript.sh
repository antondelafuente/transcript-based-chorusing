#!/bin/bash

# Usage: ./get_assemblyai_transcript.sh path/to/audio.mp3

AUDIO_FILE="$1"

if [ -z "$AUDIO_FILE" ]; then
  echo "Usage: $0 path/to/audio.mp3"
  exit 1
fi

# Derive output filename
OUTPUT_FILE="${AUDIO_FILE%.*}_transcript.json"

echo "Requesting transcript from local API at http://localhost:3000/api/transcribe..."

# Upload file to local API and save raw JSON response
curl -s -X POST \
  -F "file=@${AUDIO_FILE}" \
  http://localhost:3000/api/transcribe \
  > "${OUTPUT_FILE}"

echo "Transcript saved to ${OUTPUT_FILE}" 