import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType } = await request.json()

    if (!imageBase64 || !mimeType) {
      return NextResponse.json({ error: 'imageBase64 and mimeType are required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API not configured' }, { status: 500 })
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: imageBase64 } },
              {
                text: 'This is a utility meter (water or electricity). Extract the current numeric reading shown on the display. Return ONLY the number with no units, no text, no explanation — just the digits. If the reading is unclear or unreadable, return the word "unclear".',
              },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 64 },
        }),
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Gemini API error:', err)
      return NextResponse.json({ error: 'Failed to analyse image' }, { status: 500 })
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''

    if (!text || text.toLowerCase() === 'unclear') {
      return NextResponse.json({ error: 'Could not read meter value from image' }, { status: 422 })
    }

    // Strip any accidental non-numeric characters (spaces, commas, units)
    const cleaned = text.replace(/[^0-9.]/g, '')
    const value = parseFloat(cleaned)

    if (isNaN(value)) {
      return NextResponse.json({ error: 'Could not parse a number from the meter image' }, { status: 422 })
    }

    return NextResponse.json({ value })
  } catch (error) {
    console.error('POST /api/utilities/extract-reading error:', error)
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
  }
}
