const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json'

export interface GooglePlaceReview {
  authorName: string | null
  rating: number          // 1-5
  text: string | null
  language: string | null
  reviewedAt: Date        // converted from `time` (Unix seconds)
  raw: unknown
}

export interface GooglePlaceFetchResult {
  rating: number | null            // overall avg rating
  totalRatings: number | null
  reviews: GooglePlaceReview[]
}

/**
 * Fetch up to 5 most recent reviews + overall rating for a Google Place.
 * Throws on network / non-OK status / Google error responses.
 */
export async function fetchPlaceReviews(placeId: string): Promise<GooglePlaceFetchResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set')

  const url = new URL(PLACE_DETAILS_URL)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('fields', 'reviews,rating,user_ratings_total')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as {
    status: string
    error_message?: string
    result?: {
      rating?: number
      user_ratings_total?: number
      reviews?: Array<{
        author_name?: string
        rating: number
        text?: string
        language?: string
        time: number // Unix seconds
      }>
    }
  }

  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places status ${json.status}: ${json.error_message ?? '(no message)'}`)
  }

  const result = json.result ?? {}
  const reviews: GooglePlaceReview[] = (result.reviews ?? []).map((r) => ({
    authorName: r.author_name ?? null,
    rating: r.rating,
    text: r.text ?? null,
    language: r.language ?? null,
    reviewedAt: new Date(r.time * 1000),
    raw: r,
  }))

  return {
    rating: result.rating ?? null,
    totalRatings: result.user_ratings_total ?? null,
    reviews,
  }
}
