"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Pause, Download, Minus, Plus, AlertCircle, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Define the transcript data structure to match AssemblyAI JSON format
interface Word {
  text: string
  start: number // milliseconds in AssemblyAI
  end: number // milliseconds in AssemblyAI
  confidence?: number
  speaker?: string
}

interface TranscriptData {
  words: Word[]
  text?: string
  language_code?: string // Add language code from AssemblyAI
  language_confidence?: number // Add language confidence
  utterances?: {
    text: string
    start: number
    end: number
    speaker: string
    words: Word[]
  }[]
}

interface TranscriptViewerProps {
  transcriptData: TranscriptData
  audioUrl: string
}

export function TranscriptViewer({ transcriptData, audioUrl }: TranscriptViewerProps) {
  const { toast } = useToast()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null)
  const [audioLoaded, setAudioLoaded] = useState(false)
  const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null)
  const [isPausing, setIsPausing] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioArrayBuffer, setAudioArrayBuffer] = useState<ArrayBuffer | null>(null)
  const [isDecoding, setIsDecoding] = useState(false)

  // Loop pause duration in milliseconds
  const loopPauseDuration = 200

  // Looping is always on
  const isLooping = true

  // Language detection and typography helpers
  const getLanguageTypography = (languageCode?: string) => {
    // Map AssemblyAI language codes to typography settings
    const languageMap: Record<string, { fontClass: string; lineHeight: string }> = {
      // CJK Languages (Chinese, Japanese, Korean)
      'ja': { fontClass: 'font-japanese', lineHeight: 'leading-loose' },
      'zh': { fontClass: 'font-chinese', lineHeight: 'leading-loose' },
      'ko': { fontClass: 'font-korean', lineHeight: 'leading-loose' },
      
      // Languages that use Arabic script
      'ar': { fontClass: 'font-arabic', lineHeight: 'leading-relaxed' },
      
      // Languages that use Devanagari script
      'hi': { fontClass: 'font-devanagari', lineHeight: 'leading-relaxed' },
      
      // Languages that use Cyrillic script
      'ru': { fontClass: 'font-cyrillic', lineHeight: 'leading-relaxed' },
      'uk': { fontClass: 'font-cyrillic', lineHeight: 'leading-relaxed' },
      
      // Languages with special requirements
      'th': { fontClass: '', lineHeight: 'leading-loose' }, // Thai needs more line height
      'vi': { fontClass: '', lineHeight: 'leading-relaxed' }, // Vietnamese with diacritics
      
      // Default for Latin-based languages (English, Spanish, French, German, Italian, Portuguese, Dutch, etc.)
      'default': { fontClass: '', lineHeight: 'leading-relaxed' }
    }

    const code = languageCode?.toLowerCase() || 'default'
    return languageMap[code] || languageMap['default']
  }

  const shouldUseWordSpacing = (languageCode?: string) => {
    // Languages that don't use spaces between words
    // Based on AssemblyAI's supported languages and linguistic properties
    const noSpaceLanguages = [
      'ja',  // Japanese
      'zh',  // Chinese
      'ko',  // Korean  
      'th',  // Thai
      'lo',  // Lao (if supported)
      'km',  // Khmer (if supported)
      'my'   // Myanmar/Burmese (if supported)
    ]
    return !noSpaceLanguages.includes(languageCode?.toLowerCase() || '')
  }

  const getWordSeparator = (languageCode?: string) => {
    return shouldUseWordSpacing(languageCode) ? ' ' : ''
  }

  const getLanguageName = (languageCode?: string) => {
    // Map language codes to human-readable names
    const languageNames: Record<string, string> = {
      'en': 'English',
      'en_us': 'English (US)',
      'en_uk': 'English (UK)', 
      'en_au': 'English (AU)',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'nl': 'Dutch',
      'ja': 'Japanese',
      'zh': 'Chinese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'ru': 'Russian',
      'uk': 'Ukrainian',
      'pl': 'Polish',
      'tr': 'Turkish',
      'vi': 'Vietnamese',
      'th': 'Thai',
      'id': 'Indonesian',
      'ms': 'Malay',
      'fi': 'Finnish',
      'da': 'Danish',
      'sv': 'Swedish',
      'no': 'Norwegian',
      'cs': 'Czech',
      'el': 'Greek',
      'he': 'Hebrew',
      'hu': 'Hungarian',
      'ro': 'Romanian'
    }
    
    const code = languageCode?.toLowerCase() || ''
    return languageNames[code] || code.toUpperCase()
  }

  // Get typography settings for current transcript
  const typography = getLanguageTypography(transcriptData.language_code)
  const wordSeparator = getWordSeparator(transcriptData.language_code)

  // Web Audio API references
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioBufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startTimestampRef = useRef<number>(0) // context currentTime when playback started
  const selectionOffsetRef = useRef<number>(0) // offset into audio when playback started
  const sourceDurationRef = useRef<number>(0) // duration of the current source

  const rafRef = useRef<number | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Placeholder legacy ref (no element rendered) to avoid TypeScript errors during refactor
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Use a ref to always have access to the current selection
  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  // Convert AssemblyAI milliseconds to seconds
  const msToSeconds = (ms: number) => ms / 1000

  // Convert seconds to AssemblyAI milliseconds
  const secondsToMs = (seconds: number) => seconds * 1000

  // Format time to display with 2 decimal places
  const formatTime = (time: number): string => {
    // Always show one decimal, but trim trailing .0
    const rounded = Math.round(time * 10) / 10;
    return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}s`;
  }

  // Clean up any existing timeout
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  // Highlight the current word being spoken
  const highlightCurrentWord = (timeInSeconds: number) => {
    const timeInMs = timeInSeconds * 1000

    if (transcriptRef.current) {
      const currentWord = transcriptData.words.find((word) => timeInMs >= word.start && timeInMs <= word.end)

      if (currentWord) {
        const index = transcriptData.words.indexOf(currentWord)
        setCurrentWordIndex(index)

        // Only scroll to the word if it's not part of the current selection
        if (!selection || !(currentWord.start >= selection.start && currentWord.end <= selection.end)) {
          const currentWordElement = transcriptRef.current.querySelector(`[data-word-id="${index}"]`)

          if (currentWordElement) {
            // Scroll the word into view if it's not visible
            const container = transcriptRef.current
            const elementRect = currentWordElement.getBoundingClientRect()
            const containerRect = container.getBoundingClientRect()

            if (elementRect.bottom > containerRect.bottom || elementRect.top < containerRect.top) {
              currentWordElement.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })
            }
          }
        }
      }
    }
  }

  const handlePlayError = (error: any) => {
    console.error("Play error:", error)
    const errorMessage = error?.message || "Unable to play audio"
    setAudioError(errorMessage)
    setIsDecoding(false)
    toast({
      title: "Playback Error",
      description: errorMessage,
      variant: "destructive",
    })
    setIsPlaying(false)
    setIsPausing(false)
  }

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const startRaf = () => {
    const tick = () => {
      if (!isPlaying || !selection || !audioCtxRef.current) {
        rafRef.current = null
        return
      }
      const ctx = audioCtxRef.current
      const elapsed = ctx.currentTime - startTimestampRef.current
      const currentSec = selectionOffsetRef.current + elapsed
      setCurrentTime(currentSec)
      highlightCurrentWord(currentSec)
      
      // Check if we've passed the current selection end (in case it was shortened)
      const currentSelection = selectionRef.current
      if (currentSelection && currentSec >= msToSeconds(currentSelection.end)) {
        if (sourceRef.current) {
          try {
            sourceRef.current.stop()
          } catch {}
        }
        // The onended handler will fire and handle the loop restart
        cancelRaf()
        return
      }
      
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  const stopCurrentSource = () => {
    cancelRaf()
    
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    if (sourceRef.current) {
      try {
        sourceRef.current.stop()
      } catch {}
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    setIsPlaying(false)
    setIsPausing(false)
  }

  // Initialize or get the AudioContext lazily
  const getOrCreateAudioContext = async (): Promise<AudioContext | null> => {
    try {
      if (!audioCtxRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContextClass) {
          throw new Error("Web Audio API is not supported in this browser")
        }
        audioCtxRef.current = new AudioContextClass()
      }
      
      // Always try to resume in case it's suspended
      if (audioCtxRef.current.state === "suspended") {
        await audioCtxRef.current.resume()
      }
      
      return audioCtxRef.current
    } catch (error) {
      console.error('[getOrCreateAudioContext] Error:', error)
      handlePlayError(error)
      return null
    }
  }

  // Decode audio buffer when context is available
  const decodeAudioBuffer = async (ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer | null> => {
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0)) // Create a copy
      return audioBuffer
    } catch (error) {
      console.error('[decodeAudioBuffer] Error:', error)
      throw new Error("Failed to decode audio. The file may be corrupted or in an unsupported format.")
    }
  }

  const togglePlayPause = async () => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    if (isPlaying || isPausing) {
      // stop playback
      stopCurrentSource()
    } else {
      // Clear any previous errors
      setAudioError(null)
      
      if (!selection || !audioArrayBuffer) {
        handlePlayError(new Error("No audio data or selection available"))
        return
      }
      
      try {
        // Get or create AudioContext (lazy initialization)
        const ctx = await getOrCreateAudioContext()
        if (!ctx) return
        
        // Decode audio if not already decoded
        if (!audioBufferRef.current && audioArrayBuffer) {
          setIsDecoding(true)
          const decodedBuffer = await decodeAudioBuffer(ctx, audioArrayBuffer)
          setIsDecoding(false)
          if (!decodedBuffer) {
            handlePlayError(new Error("Failed to decode audio"))
            return
          }
          audioBufferRef.current = decodedBuffer
          setDuration(decodedBuffer.duration)
        }
        
        if (!audioBufferRef.current) {
          handlePlayError(new Error("No audio buffer available"))
          return
        }

        const source = ctx.createBufferSource()
        source.buffer = audioBufferRef.current
        source.playbackRate.value = 1
        source.connect(ctx.destination)

        const offset = msToSeconds(selection.start)
        const durationSec = msToSeconds(selection.end - selection.start)

        source.start(0, offset, durationSec)
        startTimestampRef.current = ctx.currentTime
        selectionOffsetRef.current = offset
        sourceDurationRef.current = durationSec
        const thisSource = source // capture reference to this specific source
        source.onended = () => {
          if (sourceRef.current === thisSource) {
            handleEnded() // only handle if this is still the current source
          }
        }

        sourceRef.current = source
        setIsPlaying(true)
        startRaf()
      } catch (error) {
        handlePlayError(error)
      }
    }
  }

  // Function to cycle through playback speeds
  const cyclePlaybackSpeed = () => {
    // No need to implement cyclePlaybackSpeed as playbackRate is always 1x
  }

  // Add fine-tune adjustment functions
  const adjustStartTime = (delta: number) => {
    if (!selection) return

    const currentStartSeconds = msToSeconds(selection.start)
    const currentEndSeconds = msToSeconds(selection.end)
    const newStartTime = Math.max(0, Math.min(currentStartSeconds + delta, currentEndSeconds - 0.1))

    const newSelection = {
      ...selection,
      start: secondsToMs(newStartTime),
    }
    setSelection(newSelection)

    // Don't restart playback - let current playback continue
    // The new start time will be used on the next loop
  }

  const adjustEndTime = (delta: number) => {
    if (!selection) return

    const currentStartSeconds = msToSeconds(selection.start)
    const currentEndSeconds = msToSeconds(selection.end)
    const newEndTime = Math.max(currentStartSeconds + 0.1, Math.min(currentEndSeconds + delta, duration))

    const newSelection = {
      ...selection,
      end: secondsToMs(newEndTime),
    }
    setSelection(newSelection)

    // Don't restart playback - let current playback continue
    // We need to check if we should stop early based on the new end time
  }

  const handleWordClick = (word: Word, index: number) => {
    // Select just this word
    setSelection({
      start: word.start,
      end: word.end,
      text: word.text,
    })

    if (isPlaying) {
      playSelection({ ...selection!, start: word.start, end: word.end, text: word.text })
    }
  }

  // Helper function to find the closest word element to a given node
  const findClosestWordElement = (node: Node): HTMLElement | null => {
    // If this is a text node, get its parent
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement)

    // If we have an element, check if it's a word element or find the closest one
    if (element) {
      // Check if this element is a word element
      if (element.hasAttribute("data-word-id")) {
        return element
      }

      // Check if any parent is a word element
      let parent = element.parentElement
      while (parent) {
        if (parent.hasAttribute("data-word-id")) {
          return parent
        }
        parent = parent.parentElement
      }

      // Check if any child is a word element
      const wordElement = element.querySelector("[data-word-id]")
      if (wordElement) {
        return wordElement as HTMLElement
      }
    }

    return null
  }

  // Function to handle text selection in word view
  const handleWordSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    // Get the selected range
    const range = selection.getRangeAt(0)

    // Find the closest word elements to the start and end of the selection
    const startContainer = range.startContainer
    const endContainer = range.endContainer

    const startWordElement = findClosestWordElement(startContainer)
    const endWordElement = findClosestWordElement(endContainer)

    // If we couldn't find word elements, try to find any word elements in the selection
    if (!startWordElement || !endWordElement) {
      // If we can't find word elements, check if the selection contains any word elements
      if (transcriptRef.current) {
        const allWordElements = transcriptRef.current.querySelectorAll("[data-word-id]")
        let firstSelectedWord: HTMLElement | null = null
        let lastSelectedWord: HTMLElement | null = null

        allWordElements.forEach((wordEl) => {
          const wordElement = wordEl as HTMLElement
          // Check if this word element is at least partially within the selection
          const wordRange = document.createRange()
          wordRange.selectNodeContents(wordElement)

          if (
            range.compareBoundaryPoints(Range.START_TO_END, wordRange) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_START, wordRange) >= 0
          ) {
            if (!firstSelectedWord) firstSelectedWord = wordElement
            lastSelectedWord = wordElement
          }
        })

        if (firstSelectedWord && lastSelectedWord) {
          processWordSelection(firstSelectedWord, lastSelectedWord)
        } else {
          // Still couldn't find any word elements in the selection
          toast({
            title: "Selection Error",
            description: "Please try to select some words in the transcript.",
            variant: "destructive",
          })
        }
      }
      return
    }

    // Process the selection with the found word elements
    processWordSelection(startWordElement, endWordElement)

    // Clear the browser's selection to avoid confusion
    window.getSelection()?.removeAllRanges()
  }

  // Process the word selection once we have start and end elements
  const processWordSelection = (startElement: HTMLElement, endElement: HTMLElement) => {
    if (!startElement.hasAttribute("data-word-id") || !endElement.hasAttribute("data-word-id")) {
      return
    }

    const startIndex = Number.parseInt(startElement.getAttribute("data-word-id") || "0")
    const endIndex = Number.parseInt(endElement.getAttribute("data-word-id") || "0")

    // Make sure we have the correct order (start <= end)
    const minIndex = Math.min(startIndex, endIndex)
    const maxIndex = Math.max(startIndex, endIndex)

    // Get the actual start and end times from the transcript data
    const startTime = transcriptData.words[minIndex].start
    const endTime = transcriptData.words[maxIndex].end

    // Get the selected text
    const selectedText = transcriptData.words
      .slice(minIndex, maxIndex + 1)
      .map((word) => word.text)
      .join(wordSeparator)

    setSelection({
      start: startTime,
      end: endTime,
      text: selectedText,
    })

    if (isPlaying) {
      stopCurrentSource()
      setIsPlaying(false)
    }
  }

  const handleDownload = async () => {
    if (!selection || !audioBufferRef.current) return

    try {
      toast({
        title: "Preparing Download",
        description: "Processing audio segment...",
      })

      const audioBuffer = audioBufferRef.current
      const sampleRate = audioBuffer.sampleRate
      const numberOfChannels = audioBuffer.numberOfChannels
      
      // Calculate sample positions for the selection
      const startSample = Math.floor((selection.start / 1000) * sampleRate)
      const endSample = Math.ceil((selection.end / 1000) * sampleRate)
      const lengthInSamples = endSample - startSample
      
      // Create a new AudioBuffer for the selection
      const offlineContext = new OfflineAudioContext(
        numberOfChannels,
        lengthInSamples,
        sampleRate
      )
      
      const newBuffer = offlineContext.createBuffer(
        numberOfChannels,
        lengthInSamples,
        sampleRate
      )
      
      // Copy the selected portion of audio data
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceData = audioBuffer.getChannelData(channel)
        const targetData = newBuffer.getChannelData(channel)
        
        for (let i = 0; i < lengthInSamples; i++) {
          targetData[i] = sourceData[startSample + i]
        }
      }
      
      // Convert to WAV format
      const wavBlob = audioBufferToWav(newBuffer)
      
      // Generate filename with selection times
      const startTime = (selection.start / 1000).toFixed(1)
      const endTime = (selection.end / 1000).toFixed(1)
      const filename = `selection_${startTime}s-${endTime}s.wav`
      
      // Create download link
      const url = URL.createObjectURL(wavBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      toast({
        title: "Download Complete",
        description: `Saved ${filename}`,
      })
    } catch (error) {
      console.error("Error downloading audio segment:", error)
      toast({
        title: "Download Error",
        description: "Failed to download audio segment. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Helper function to convert AudioBuffer to WAV blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numberOfChannels = buffer.numberOfChannels
    const length = buffer.length * numberOfChannels * 2 + 44
    const arrayBuffer = new ArrayBuffer(length)
    const view = new DataView(arrayBuffer)
    const channels: Float32Array[] = []
    let offset = 0
    let pos = 0

    // Write WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true)
      pos += 2
    }

    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true)
      pos += 4
    }

    // RIFF identifier
    setUint32(0x46464952) // "RIFF"
    setUint32(length - 8) // file length - 8
    setUint32(0x45564157) // "WAVE"

    // fmt sub-chunk
    setUint32(0x20746d66) // "fmt "
    setUint32(16) // subchunk size
    setUint16(1) // PCM format
    setUint16(numberOfChannels)
    setUint32(buffer.sampleRate)
    setUint32(buffer.sampleRate * 2 * numberOfChannels) // byte rate
    setUint16(numberOfChannels * 2) // block align
    setUint16(16) // bits per sample

    // data sub-chunk
    setUint32(0x61746164) // "data"
    setUint32(length - pos - 4) // subchunk size

    // Write interleaved data
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i))
    }

    while (pos < length) {
      for (let i = 0; i < numberOfChannels; i++) {
        // Convert float samples to 16-bit PCM
        let sample = Math.max(-1, Math.min(1, channels[i][offset])) // clamp
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF // scale to 16-bit
        view.setInt16(pos, sample, true)
        pos += 2
      }
      offset++
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' })
  }

  // Determine the CSS class for a word based on whether it's selected or current
  const getWordClass = (word: Word, index: number) => {
    // Check if the word is part of the current selection
    const isSelected = selection && word.start >= selection.start && word.end <= selection.end

    // Check if the word is the current word being played
    const isCurrent = index === currentWordIndex

    // When playing: current word highlighting takes precedence
    // When paused: selection highlighting takes precedence
    if ((isPlaying || isPausing) && isCurrent) {
      return "bg-blue-400 text-white"
    } else if (isSelected) {
      return "bg-blue-200"
    } else {
      return ""
    }
  }

  // Group words by speaker for rendering
  const renderTranscriptWithSpeakerBreaks = () => {
    if (!transcriptData.words || transcriptData.words.length === 0) {
      return <div className="text-center text-gray-500 py-8">No transcript data available</div>
    }

    // Configuration
    const PAUSE_THRESHOLD = 2000 // ms for natural paragraph break
    const SMALL_PAUSE_THRESHOLD = 200 // ms for emergency break when paragraph is long
    const MAX_WORDS_PER_PARAGRAPH = 150 // safety limit

    // Group words by speaker and pauses
    const result = []
    let currentSpeaker = null
    let currentGroup = []
    let wordIndex = 0
    let paragraphWordCount = 0

    for (let i = 0; i < transcriptData.words.length; i++) {
      const word = transcriptData.words[i]
      const previousWord = i > 0 ? transcriptData.words[i - 1] : null
      
      // Calculate pause duration if not the first word
      const pauseDuration = previousWord ? word.start - previousWord.end : 0
      
      // Determine if we should start a new paragraph
      let shouldBreak = false
      
      // Break on speaker change
      if (word.speaker !== currentSpeaker && currentGroup.length > 0) {
        shouldBreak = true
      }
      
      // Break on natural pause
      if (pauseDuration >= PAUSE_THRESHOLD) {
        shouldBreak = true
      }
      
      // Safety: break on smaller pause if paragraph is getting too long
      if (paragraphWordCount >= MAX_WORDS_PER_PARAGRAPH && pauseDuration >= SMALL_PAUSE_THRESHOLD) {
        shouldBreak = true
      }
      
      // Emergency: force break if we hit the absolute word limit
      if (paragraphWordCount >= MAX_WORDS_PER_PARAGRAPH && !shouldBreak) {
        shouldBreak = true
      }

      // Create new paragraph if needed
      if (shouldBreak && currentGroup.length > 0) {
        result.push(
          <p key={`speaker-${currentSpeaker}-${wordIndex - currentGroup.length}`} className="mb-5">
            {currentGroup}
          </p>,
        )
        currentGroup = []
        paragraphWordCount = 0
      }

      // Add the current word to the group
      currentGroup.push(
        <span
          key={wordIndex}
          data-word-id={wordIndex}
          data-start={word.start}
          data-end={word.end}
          className={`cursor-pointer hover:bg-gray-50 rounded transition-colors ${getWordClass(
            word,
            wordIndex,
          )}`}
          onClick={() => handleWordClick(word, wordIndex)}
        >
          {word.text}{wordSeparator}
        </span>,
      )

      currentSpeaker = word.speaker
      wordIndex++
      paragraphWordCount++
    }

    // Add the last group
    if (currentGroup.length > 0) {
      result.push(
        <p key={`speaker-${currentSpeaker}-last`} className="mb-5">
          {currentGroup}
        </p>,
      )
    }

    return result
  }

  // Load and decode the audio file using Web Audio API
  useEffect(() => {
    let isMounted = true
    const loadAudio = async () => {
      try {
        setAudioError(null)
        const response = await fetch(audioUrl, { mode: "cors" })
        if (!response.ok) {
          throw new Error(`Failed to load audio: ${response.status} ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        if (!isMounted) return
        
        // Store the array buffer for later decoding
        setAudioArrayBuffer(arrayBuffer)
        setAudioLoaded(true)
        
        // Don't create AudioContext here - wait for user interaction
      } catch (err) {
        console.error("Audio load error", err)
        if (!isMounted) return
        const errorMessage = err instanceof Error ? err.message : "Failed to load audio file"
        setAudioError(errorMessage)
        toast({
          title: "Audio Error",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
    loadAudio()
    return () => {
      isMounted = false
    }
  }, [audioUrl, toast])

  // Improved cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop any playing audio
      stopCurrentSource()
      
      // Clear any timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      
      // Cancel any animation frames
      cancelRaf()
      
      // Close and cleanup AudioContext
      if (audioCtxRef.current) {
        try {
          audioCtxRef.current.close()
        } catch (error) {
          console.error('[Cleanup] Error closing AudioContext:', error)
        }
        audioCtxRef.current = null
      }
      
      // Clear references
      audioBufferRef.current = null
      sourceRef.current = null
    }
  }, [])

  const handleEnded = () => {
    const currentSelection = selectionRef.current // get fresh selection from ref
    cancelRaf()
    
    // Check if this source ended at a point before the current selection end
    // This happens when the endpoint was extended during playback
    const sourceEndedAt = selectionOffsetRef.current + sourceDurationRef.current
    const currentSelectionEnd = currentSelection ? msToSeconds(currentSelection.end) : 0
    
    sourceRef.current = null // source already ended
    
    if (currentSelection && sourceEndedAt < currentSelectionEnd - 0.01) { // small tolerance for float comparison
      // Play the extended portion
      if (audioCtxRef.current && audioBufferRef.current) {
        const ctx = audioCtxRef.current
        const source = ctx.createBufferSource()
        source.buffer = audioBufferRef.current
        source.playbackRate.value = 1
        source.connect(ctx.destination)
        
        const extensionDuration = currentSelectionEnd - sourceEndedAt
        source.start(0, sourceEndedAt, extensionDuration)
        
        startTimestampRef.current = ctx.currentTime
        selectionOffsetRef.current = sourceEndedAt
        sourceDurationRef.current = extensionDuration
        
        const thisSource = source
        source.onended = () => {
          if (sourceRef.current === thisSource) {
            handleEnded() // This will now trigger the normal loop
          }
        }
        
        sourceRef.current = source
        setIsPlaying(true)
        startRaf()
      }
      return
    }
    
    if (currentSelection && isLooping) {
      setIsPausing(true)
      timeoutRef.current = setTimeout(() => {
        setIsPausing(false)
        // restart playback from selection start - don't use togglePlayPause as state might be stale
        if (currentSelection && audioCtxRef.current && audioBufferRef.current) {
          playSelection(currentSelection)
        }
      }, loopPauseDuration)
    } else {
      setIsPlaying(false)
      setIsPausing(false)
    }
  }

  const playSelection = async (sel: { start: number; end: number; text: string }) => {
    stopCurrentSource()
    setAudioError(null)
    
    if (!audioArrayBuffer) {
      handlePlayError(new Error("No audio data available"))
      return
    }
    
    try {
      const ctx = await getOrCreateAudioContext()
      if (!ctx) return
      
      // Decode audio if not already decoded
      if (!audioBufferRef.current && audioArrayBuffer) {
        setIsDecoding(true)
        const decodedBuffer = await decodeAudioBuffer(ctx, audioArrayBuffer)
        setIsDecoding(false)
        if (!decodedBuffer) {
          handlePlayError(new Error("Failed to decode audio"))
          return
        }
        audioBufferRef.current = decodedBuffer
        setDuration(decodedBuffer.duration)
      }
      
      if (!audioBufferRef.current) {
        handlePlayError(new Error("No audio buffer available"))
        return
      }
      
      const source = ctx.createBufferSource()
      source.buffer = audioBufferRef.current
      source.playbackRate.value = 1
      source.connect(ctx.destination)

      const offset = msToSeconds(sel.start)
      const durationSec = msToSeconds(sel.end - sel.start)

      source.start(0, offset, durationSec)
      startTimestampRef.current = ctx.currentTime
      selectionOffsetRef.current = offset
      sourceDurationRef.current = durationSec
      const thisSource = source
      source.onended = () => {
        if (sourceRef.current === thisSource) {
          handleEnded()
        }
      }

      sourceRef.current = source
      setIsPlaying(true)
      startRaf()
    } catch (error) {
      handlePlayError(error)
    }
  }

  // Retry loading audio
  const retryLoadAudio = async () => {
    setAudioError(null)
    setAudioLoaded(false)
    setAudioArrayBuffer(null)
    
    // Trigger reload by changing audioUrl dependency
    const loadAudio = async () => {
      try {
        const response = await fetch(audioUrl, { mode: "cors" })
        if (!response.ok) {
          throw new Error(`Failed to load audio: ${response.status} ${response.statusText}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        setAudioArrayBuffer(arrayBuffer)
        setAudioLoaded(true)
        setAudioError(null)
        
        toast({
          title: "Success",
          description: "Audio loaded successfully",
        })
      } catch (err) {
        console.error("Audio reload error", err)
        const errorMessage = err instanceof Error ? err.message : "Failed to load audio file"
        setAudioError(errorMessage)
        toast({
          title: "Audio Error", 
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
    loadAudio()
  }

  return (
    <div className="grid gap-6">
      {/* Error alert */}
      {audioError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Audio Error</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{audioError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={retryLoadAudio}
              className="ml-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Word-by-word transcript display - Removed title and icon */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-0">
          <div
            className={`p-5 max-h-[400px] overflow-y-auto ${typography.lineHeight} ${typography.fontClass} text-gray-700`}
            ref={transcriptRef}
            onMouseUp={handleWordSelection}
          >
            {renderTranscriptWithSpeakerBreaks()}
          </div>
          {/* Time adjustment controls */}
          <div className="border-t border-gray-200 p-4 bg-gray-50/50">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {/* Start time controls */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-700 min-w-[35px]">Start:</span>
                <span className="font-mono text-gray-800 min-w-[45px] text-right">
                  {selection ? formatTime(msToSeconds(selection.start)) : "0s"}
                </span>
                <div className="flex gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => adjustStartTime(-0.1)}
                    disabled={!selection || msToSeconds(selection.start) <= 0}
                    className="h-7 w-7 p-0 text-gray-600 border-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => adjustStartTime(0.1)}
                    disabled={!selection || msToSeconds(selection.start) >= msToSeconds(selection.end) - 0.1}
                    className="h-7 w-7 p-0 text-gray-600 border-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>

              {/* End time controls */}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-700 min-w-[30px]">End:</span>
                <span className="font-mono text-gray-800 min-w-[45px] text-right">
                  {selection ? formatTime(msToSeconds(selection.end)) : "0s"}
                </span>
                <div className="flex gap-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => adjustEndTime(-0.1)}
                    disabled={!selection || msToSeconds(selection.end) <= msToSeconds(selection.start) + 0.1}
                    className="h-7 w-7 p-0 text-gray-600 border-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <Minus className="h-2.5 w-2.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => adjustEndTime(0.1)}
                    disabled={!selection || msToSeconds(selection.end) >= duration}
                    className="h-7 w-7 p-0 text-gray-600 border-gray-400 hover:text-gray-800 disabled:opacity-50"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </Button>
                </div>
              </div>

              {/* Duration display */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-gray-600">Duration:</span>
                <span className="font-mono text-gray-800">
                  {selection ? formatTime(msToSeconds(selection.end) - msToSeconds(selection.start)) : "0s"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audio controls - Redesigned layout with requested changes */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Primary controls group */}
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
              {/* Play/Pause button */}
              <Button
                size="lg"
                onClick={togglePlayPause}
                disabled={!audioLoaded || !selection || !!audioError || isDecoding}
                className={`min-w-[160px] transition-all ${
                  isPlaying || isPausing ? "bg-orange-400 hover:bg-orange-500" : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {isDecoding ? (
                  <>
                    <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent mr-2" />
                    Loading...
                  </>
                ) : isPlaying || isPausing ? (
                  <>
                    <Pause className="h-5 w-5 mr-2" />
                    Pause Selection
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 mr-2" />
                    Play Selection
                  </>
                )}
              </Button>

              {/* Single speed button that cycles through speeds */}
              {/* Speed control removed for simplicity */}
            </div>

            {/* Spacer for flex layout */}
            <div className="flex-grow"></div>

            {/* Secondary controls - Download button now same size as Play button */}
            <Button
              variant="outline"
              size="lg"
              onClick={handleDownload}
              disabled={!selection || !audioLoaded || !!audioError}
              className="min-w-[160px] text-gray-700 border-gray-300 hover:bg-gray-50"
            >
              <Download className="h-5 w-5 mr-2" />
              Download Selection
            </Button>
          </div>
        </CardContent>
      </Card>

      {!audioLoaded && !audioError && (
        <Card className="bg-gray-50 border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center">
              <div className="mr-4">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-gray-400 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              </div>
              <div>
                <h3 className="font-medium text-gray-800">Loading Audio</h3>
                <p className="text-sm text-gray-600">Please wait while the audio file is loading...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
