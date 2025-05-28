import { NextRequest, NextResponse } from 'next/server'

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY
const ASSEMBLYAI_UPLOAD_URL = 'https://api.assemblyai.com/v2/upload'
const ASSEMBLYAI_TRANSCRIPT_URL = 'https://api.assemblyai.com/v2/transcript'

export async function POST(request: NextRequest) {
  try {
    // Check if API key is configured
    if (!ASSEMBLYAI_API_KEY) {
      return NextResponse.json({ error: 'AssemblyAI API key not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Step 1: Upload file to AssemblyAI
    const fileBuffer = await file.arrayBuffer()
    const uploadResponse = await fetch(ASSEMBLYAI_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'authorization': ASSEMBLYAI_API_KEY,
        'content-type': 'application/octet-stream',
      },
      body: fileBuffer,
    })

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.status}`)
    }

    const { upload_url } = await uploadResponse.json()
    console.log('File uploaded:', upload_url)

    // Step 2: Submit for transcription with speaker labels and language detection
    const transcriptResponse = await fetch(ASSEMBLYAI_TRANSCRIPT_URL, {
      method: 'POST',
      headers: {
        'authorization': ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: upload_url,
        speaker_labels: true,  // Enable speaker diarization
        language_detection: true,  // Enable automatic language detection
      }),
    })

    if (!transcriptResponse.ok) {
      throw new Error(`Transcription submission failed: ${transcriptResponse.status}`)
    }

    const transcriptData = await transcriptResponse.json()
    console.log('Transcription started:', transcriptData.id)

    // Step 3: Poll for completion
    let transcript = transcriptData
    while (transcript.status !== 'completed' && transcript.status !== 'error') {
      await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds
      
      const statusResponse = await fetch(`${ASSEMBLYAI_TRANSCRIPT_URL}/${transcript.id}`, {
        headers: {
          'authorization': ASSEMBLYAI_API_KEY,
        },
      })
      
      transcript = await statusResponse.json()
      console.log('Transcription status:', transcript.status)
    }

    if (transcript.status === 'error') {
      throw new Error('Transcription failed: ' + transcript.error)
    }

    // Return the completed transcript
    return NextResponse.json(transcript)

  } catch (error) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
} 