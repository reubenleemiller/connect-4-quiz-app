const GOOGLE_SLIDES_ID = /docs\.google\.com\/presentation\/d\/([\w-]+)/
const IMAGE_SLIDE_CHOICES = ['A)', 'B)', 'C)', 'D)']

function extractAnswerLetter(line) {
  const labelledAnswer = /^(?:correct\s+)?(?:answer|correct)(?:\s+is)?\s*[:=\-]?\s*\(?([A-D])\)?\b/i
  const match = line.match(labelledAnswer) || line.match(/^\(?([A-D])\)?[.!]?$/i)
  return match?.[1]?.toUpperCase() || null
}

function parseQuestion(slide, index, sourceUrl, compactPrompt = false) {
  const lines = slide
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[•●▪◦]\s*/, '').trim())
    .filter(Boolean)
  const answerLineIndex = lines.findIndex((line) => Boolean(extractAnswerLetter(line)))
  const answerLetter = answerLineIndex >= 0 ? extractAnswerLetter(lines[answerLineIndex]) : null
  const options = []
  const optionLineIndexes = new Set()

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    if (lineIndex === answerLineIndex) continue
    const line = lines[lineIndex]
    const match = line.match(/^([A-D])(?:\s*[).:=\-]\s*(.*)|\s+(.+))$/i)
    if (!match) continue
    let text = (match[2] || match[3] || '').trim()
    let consumedIndex = lineIndex
    if (!text && lines[lineIndex + 1] && !extractAnswerLetter(lines[lineIndex + 1])) {
      text = lines[lineIndex + 1]
      consumedIndex = lineIndex + 1
    }
    if (!text || options.some((option) => option.letter === match[1].toUpperCase())) continue
    options.push({ letter: match[1].toUpperCase(), text })
    optionLineIndexes.add(lineIndex)
    optionLineIndexes.add(consumedIndex)
  }

  const promptLines = lines
    .filter((_, lineIndex) => lineIndex !== answerLineIndex && !optionLineIndexes.has(lineIndex))
  const prompt = (compactPrompt ? promptLines.slice(-3) : promptLines)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const answer = options.findIndex((option) => option.letter === answerLetter)
  // A Google Slides plain-text export includes presenter notes. When a slide is
  // made entirely from an image, that answer note is the only extractable text.
  // Preserve the visual slide in the player and give the team four letter-only
  // choices rather than rejecting an otherwise usable image question.
  const isImageOnlyQuestion = options.length === 0 && Boolean(answerLetter)
  if ((!isImageOnlyQuestion && options.length < 2) || (!isImageOnlyQuestion && answer < 0)) return null
  return {
    number: index + 1,
    topic: 'Google Slides',
    // The embedded slide is the source of the question. Do not surface the
    // export's surrounding text in the quiz modal, since Google can combine
    // text from neighbouring slides in its plain-text export.
    prompt: '',
    options: isImageOnlyQuestion ? IMAGE_SLIDE_CHOICES : options.map((option) => option.text),
    answer: isImageOnlyQuestion ? answerLetter.charCodeAt(0) - 65 : answer,
    slideUrl: sourceUrl,
    imageOnly: isImageOnlyQuestion,
  }
}

const ANSWER_LINE = /^(?:(?:correct\s+)?(?:answer|correct)(?:\s+is)?\s*[:=\-]?\s*\(?[A-D]\)?\b|\(?[A-D]\)?[.!]?)$/i

function splitAtAnswerLines(rawText) {
  const blocks = []
  let current = []
  rawText.replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
    current.push(line)
    const normalized = line.replace(/^\s*[•●▪◦]\s*/, '').trim()
    if (ANSWER_LINE.test(normalized)) {
      blocks.push(current.join('\n').trim())
      current = []
    }
  })
  if (current.join('').trim()) blocks.push(current.join('\n').trim())
  return blocks.filter(Boolean)
}

function parseQuestions(rawText, sourceUrl) {
  const separatedSlides = rawText
    .split(/\f|\n\s*---\s*\n|\n(?=slide\s+\d+(?:\s*[:—-]|\s*$))/gi)
    .map((slide) => slide.trim())
    .filter(Boolean)
  // Google sometimes returns a flattened text export with no form feeds or
  // slide headers. Each supported quiz slide ends in an Answer line, so use
  // that stable marker to recover individual question blocks in that case.
  const answerDelimitedSlides = separatedSlides.length === 1 ? splitAtAnswerLines(rawText) : []
  const sourceSlides = answerDelimitedSlides.length > 1 ? answerDelimitedSlides : separatedSlides
  const candidateSlides = sourceSlides.map((text) => ({ text, compactPrompt: sourceSlides.length === 1 }))
  const seen = new Set()
  return candidateSlides
    .map((slide, index) => parseQuestion(slide.text, index, sourceUrl, slide.compactPrompt))
    .filter((slide) => {
      const key = slide && `${slide.options.join('\u0001')}\u0001${slide.answer}`
      if (!slide || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export { parseQuestions }

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed.' })

  const suppliedUrl = typeof request.query.url === 'string' ? request.query.url : ''
  const id = suppliedUrl.match(GOOGLE_SLIDES_ID)?.[1]
  if (!id) return response.status(400).json({ error: 'Use a Google Slides presentation sharing link.' })

  try {
    // This endpoint works for decks shared with "Anyone with the link can view".
    const exportUrl = `https://docs.google.com/presentation/d/${id}/export/txt`
    const upstream = await fetch(exportUrl, { headers: { 'User-Agent': 'QuizFour/1.0' } })
    if (!upstream.ok) return response.status(422).json({ error: 'Google could not export this deck. Set sharing to “Anyone with the link can view” and try again.' })
    const text = await upstream.text()
    const slides = parseQuestions(text, `https://docs.google.com/presentation/d/${id}/preview`)
    if (!slides.length) return response.status(422).json({ error: 'No quiz slides found. Use editable A–D choices with “Answer: A”, or use an image-only slide and put its correct letter (for example, “Answer: A”) in that slide’s presenter notes.' })

    return response.status(200).json({
      title: 'Imported Google Slides deck',
      slides,
    })
  } catch {
    return response.status(502).json({ error: 'Unable to reach Google Slides right now. Please try again.' })
  }
}
