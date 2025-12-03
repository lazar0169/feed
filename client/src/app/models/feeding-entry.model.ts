export interface FeedingEntry {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  time: string; // Time in HH:mm format
  amount: number; // Amount in ml
  comment?: string;
  timestamp: number; // Unix timestamp for sorting
}
