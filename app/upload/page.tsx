"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Upload, FileAudio, ArrowRight, X, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useTranscript } from "@/app/contexts/transcript-context"

export default function UploadPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { setAudioFile, setTranscriptData } = useTranscript()
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle drag events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    handleFiles(files)
  }

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      handleFiles(files)
    }
  }

  // Process the selected files
  const handleFiles = (files: FileList) => {
    if (files.length === 0) return

    const file = files[0]

    // Check if file is audio or video
    if (!file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid File Type",
        description: "Please select an audio or video file.",
        variant: "destructive",
      })
      return
    }

    setSelectedFile(file)
  }

  // Trigger file input click
  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Clear selected file
  const clearSelectedFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  // Process file and navigate to transcript viewer
  const processFile = async () => {
    if (!selectedFile) return

    setIsProcessing(true)

    try {
      // Show initial toast
      toast({
        title: "Processing File",
        description: "Uploading and transcribing your file...",
      })

      // Create form data
      const formData = new FormData()
      formData.append('file', selectedFile)

      // Call our API
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Transcription failed')
      }

      const transcriptData = await response.json()

      // Store the file and transcript data in context
      setAudioFile(selectedFile)
      setTranscriptData(transcriptData)

      toast({
        title: "Success!",
        description: "Transcription complete. Loading transcript viewer...",
      })

      // Navigate to the main page
      router.push('/')

    } catch (error) {
      console.error('Processing error:', error)
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process file",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <main className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8 text-gray-800">Transcript-based Chorusing</h1>

      {/* File Upload Area */}
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="p-0">
          <div
            className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-lg transition-colors ${
              isDragging
                ? "border-orange-400 bg-orange-50"
                : selectedFile
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
            }`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            {!selectedFile ? (
              <>
                <div className="mb-4">
                  <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <Upload className="h-8 w-8 text-gray-500" />
                  </div>
                </div>
                <h2 className="text-xl font-medium text-gray-700 mb-2">Drag and drop your file here</h2>
                <p className="text-gray-500 mb-4">or click to browse your files</p>
                <Button onClick={triggerFileInput} className="bg-orange-500 hover:bg-orange-600">
                  <FileAudio className="h-5 w-5 mr-2" />
                  Select Audio or Video File
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="audio/*,video/*"
                  className="hidden"
                />
              </>
            ) : (
              <div className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <FileAudio className="h-6 w-6 text-gray-600 mr-2" />
                    <div>
                      <h3 className="font-medium text-gray-800">{selectedFile.name}</h3>
                      <p className="text-sm text-gray-500">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelectedFile}
                    className="text-gray-500 hover:text-gray-700"
                    disabled={isProcessing}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  onClick={processFile}
                  className="w-full bg-orange-500 hover:bg-orange-600"
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent" />
                      Processing... This may take a minute
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-5 w-5 mr-2" />
                      Process File
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
