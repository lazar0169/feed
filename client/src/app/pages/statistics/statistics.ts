import { Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FeedingService } from '../../services/feeding.service';

interface PeriodStats {
  totalFeedings: number;
  totalAmount: number;
  averageAmount: number;
  averageFeedingsPerDay: number;
  // Milk specific
  milkFeedings: number;
  totalMilk: number;
  averageMilk: number;
  // Solids specific
  solidFeedings: number;
  totalSolidsGrams: number;
  totalSolidsSpoons: number;
}

@Component({
  selector: 'app-statistics',
  imports: [CommonModule],
  templateUrl: './statistics.html',
  styleUrl: './statistics.scss',
})
export class Statistics implements OnInit {
  private feedingService = inject(FeedingService);
  private destroyRef = inject(DestroyRef);

  // Modern Angular signals for reactive state
  protected weekStats = signal<PeriodStats | undefined>(undefined);
  protected monthStats = signal<PeriodStats | undefined>(undefined);
  // Stats over the whole in-memory recent window (see FeedingService).
  protected windowStats = signal<PeriodStats | undefined>(undefined);
  protected readonly windowDays = this.feedingService.getWindowDays();

  ngOnInit(): void {
    // Recompute whenever entries$ emits, with automatic teardown on destroy.
    this.feedingService.entries$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadStatistics());
  }

  private loadStatistics(): void {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString().split('T')[0];

    // week/month are exact — both fall inside the recent window.
    this.weekStats.set(this.feedingService.getStatistics(weekAgoStr));
    this.monthStats.set(this.feedingService.getStatistics(monthAgoStr));
    // No date filter => the entire recent window.
    this.windowStats.set(this.feedingService.getStatistics());
  }
}
