"use client"

import { useState, useEffect } from "react"
import { TranscriptViewer } from "@/components/transcript-viewer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Upload } from "lucide-react"
import Link from "next/link"
import { useTranscript } from "@/app/contexts/transcript-context"

export default function Home() {
  const { toast } = useToast()
  const { audioFile, transcriptData } = useTranscript()
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Demo data URLs
  const demoAudioUrl = "/demo-audio.mp3"
  const demoTranscriptUrl = "/demo-transcript.json"
  
  const [demoTranscriptData, setDemoTranscriptData] = useState<any>(null)
  const [isDemoLoading, setIsDemoLoading] = useState(true)

  // Create blob URL for uploaded audio file
  useEffect(() => {
    if (audioFile) {
      const url = URL.createObjectURL(audioFile)
      setAudioUrl(url)
      
      // Cleanup function to revoke the URL when component unmounts
      return () => {
        URL.revokeObjectURL(url)
      }
    }
  }, [audioFile])

  // Load demo transcript if no uploaded data
  useEffect(() => {
    if (!transcriptData) {
      const loadDemoData = async () => {
      try {
          setIsDemoLoading(true)
          const response = await fetch(demoTranscriptUrl)
        if (!response.ok) {
            throw new Error(`Failed to fetch demo transcript: ${response.status}`)
        }
        const data = await response.json()
          setDemoTranscriptData(data)
      } catch (err) {
          console.error("Error loading demo transcript:", err)
          setError("Failed to load demo transcript")
        toast({
            title: "Error Loading Demo",
            description: "There was a problem loading the demo transcript.",
          variant: "destructive",
        })
        } finally {
          setIsDemoLoading(false)
      }
    }
      loadDemoData()
    }
  }, [transcriptData, toast])

  // Determine which data to use
  const currentTranscriptData = transcriptData || demoTranscriptData
  const currentAudioUrl = audioUrl || demoAudioUrl
  const isUsingUploadedData = !!transcriptData && !!audioUrl

  // Show loading state
  if (!transcriptData && isDemoLoading) {
  return (
    <main className="max-w-3xl mx-auto py-4 sm:py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Transcript-based Chorusing</h1>
        <Link href="/upload">
          <Button variant="outline" className="w-full sm:w-auto text-gray-700 border-gray-300 hover:bg-gray-50">
            <Upload className="h-4 w-4 mr-2" />
            Upload New File
          </Button>
        </Link>
      </div>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-gray-400 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              <p className="mt-4 text-gray-600">Loading transcript data...</p>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Show error state
  if (error) {
    return (
      <main className="max-w-3xl mx-auto py-4 sm:py-8 px-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Transcript-based Chorusing</h1>
          <Link href="/upload">
            <Button variant="outline" className="w-full sm:w-auto text-gray-700 border-gray-300 hover:bg-gray-50">
              <Upload className="h-4 w-4 mr-2" />
              Upload New File
            </Button>
          </Link>
        </div>
        <Card className="bg-red-50 border-red-200 shadow-sm">
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-red-600 mb-4">{error}</p>
              <Link href="/upload">
                <Button className="bg-orange-500 hover:bg-orange-600">
                  Upload a File
              </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  // Show main content
  return (
    <main className="max-w-3xl mx-auto py-4 sm:py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Transcript-based Chorusing</h1>
          {isUsingUploadedData && audioFile && (
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Using: {audioFile.name}
            </p>
          )}
          {!isUsingUploadedData && (
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              Demo: 14 Minutes of Nate Bargatze
            </p>
          )}
        </div>
        <Link href="/upload">
          <Button variant="outline" className="w-full sm:w-auto text-gray-700 border-gray-300 hover:bg-gray-50">
            <Upload className="h-4 w-4 mr-2" />
            <span className="sm:inline">Upload New File</span>
          </Button>
        </Link>
      </div>

      {currentTranscriptData && currentAudioUrl ? (
        <TranscriptViewer transcriptData={currentTranscriptData} audioUrl={currentAudioUrl} />
      ) : (
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="py-8">
            <p className="text-center text-gray-600">No transcript data available.</p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
