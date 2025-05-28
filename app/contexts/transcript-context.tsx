"use client"

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface TranscriptContextType {
  audioFile: File | null
  transcriptData: any | null
  setAudioFile: (file: File | null) => void
  setTranscriptData: (data: any | null) => void
  clearData: () => void
}

const TranscriptContext = createContext<TranscriptContextType | undefined>(undefined)

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [transcriptData, setTranscriptData] = useState<any | null>(null)

  const clearData = () => {
    setAudioFile(null)
    setTranscriptData(null)
  }

  return (
    <TranscriptContext.Provider
      value={{
        audioFile,
        transcriptData,
        setAudioFile,
        setTranscriptData,
        clearData,
      }}
    >
      {children}
    </TranscriptContext.Provider>
  )
}

export function useTranscript() {
  const context = useContext(TranscriptContext)
  if (context === undefined) {
    throw new Error('useTranscript must be used within a TranscriptProvider')
  }
  return context
} 