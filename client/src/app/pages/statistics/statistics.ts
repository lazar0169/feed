import { Component, OnInit, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedingService } from '../../services/feeding.service';

interface PeriodStats {
  totalFeedings: number;
  totalAmount: number;
  averageAmount: number;
  averageFeedingsPerDay: number;
}

@Component({
  selector: 'app-statistics',
  imports: [CommonModule],
  templateUrl: './statistics.html',
  styleUrl: './statistics.scss',
})
export class Statistics implements OnInit {
  // Modern Angular signals for reactive state
  protected weekStats = signal<PeriodStats | undefined>(undefined);
  protected monthStats = signal<PeriodStats | undefined>(undefined);
  protected allTimeStats = signal<PeriodStats | undefined>(undefined);

  constructor(private feedingService: FeedingService) {
    // Effect runs whenever entries$ emits
    effect(() => {
      this.feedingService.entries$.subscribe(() => {
        this.loadStatistics();
      });
    });
  }

  ngOnInit(): void {
    this.loadStatistics();
  }

  private loadStatistics(): void {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const monthAgoStr = monthAgo.toISOString().split('T')[0];

    this.weekStats.set(this.feedingService.getStatistics(weekAgoStr));
    this.monthStats.set(this.feedingService.getStatistics(monthAgoStr));
    this.allTimeStats.set(this.feedingService.getStatistics());
  }
}
