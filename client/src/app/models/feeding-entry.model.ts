export type FeedingType = 'milk' | 'solid';

export interface FeedingEntry {
  id: string;
  type: FeedingType; // Type of feeding
  date: string; // ISO date string (YYYY-MM-DD)
  time: string; // Time in HH:mm format
  amount: number; // Amount in ml for milk, grams for solid (0 if spoons used)
  name?: string; // Name of solid food (only for type 'solid')
  spoons?: number; // Number of spoons (only for type 'solid', alternative to grams)
  comment?: string;
  timestamp: number; // Unix timestamp for sorting
}
