import type { StayState } from '@/lib/oracle/types'
export class GuestInputError extends Error { constructor(message: string, public readonly status = 400) { super(message) } }
export type GuestScope = { accessId: string; guestProfileId: string; orgId: string; propertyId: string; version: number; stayState: StayState; arrivalDate: string; departureDate: string; expiresAt: string; fresh: boolean }
export type QuestionType = 'short_text' | 'long_text' | 'date' | 'time' | 'yes_no' | 'single_choice' | 'multi_choice' | 'file'
export type PublicQuestion = { id: string; prompt: string; type: QuestionType; options: string[]; required: boolean }
export type QuestionnaireInput = { submissionId: string; answers: { questionId: string; text?: string; options?: string[]; uploadId?: string }[] }
export type GuestRequestInput = { submissionId: string; kind: 'dining' | 'excursion' | 'service'; itemId?: string; itemKind?: 'menu_item' | 'set_menu' | 'excursion'; notes: string; requestedDate?: string; requestedTime?: string; partySize?: number; quantity?: number }
export type PublicGuestRequest = { id: string; kind: GuestRequestInput['kind']; title: string; notes: string; requestedDate: string | null; requestedTime: string | null; partySize: number | null; quantity: number | null; priceNote: string | null; state: 'received' | 'in_progress' | 'completed' | 'declined'; publicReply: string | null; createdAt: string }
export type StaffGuestRequest = PublicGuestRequest & { guestProfileId: string; guestName: string | null; roomNumber: string | null; internalNote: string | null; version: number }
