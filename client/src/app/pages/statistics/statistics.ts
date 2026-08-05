import { Component, OnInit, DestroyRef, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FeedingService, DailyTotal, IntervalStats, WeekComparison } from '../../services/feeding.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsService } from '../../services/settings.service';

interface Bar {
  x: number;
  y: number;
  height: number;
  label: string;
  showLabel: boolean;
  title: string;
}

interface BarChart {
  maxVal: number;
  barW: number;
  bars: Bar[];
}

@Component({
  selector: 'app-statistics',
  imports: [CommonModule],
  templateUrl: './statistics.html',
  styleUrl: './statistics.scss',
})
export class Statistics implements OnInit {
  private feedingService = inject(FeedingService);
  private notificationService = inject(NotificationService);
  private settingsService = inject(SettingsService);
  private destroyRef = inject(DestroyRef);

  private readonly TREND_DAYS = 14;

  // SVG chart coordinate system (scaled uniformly to the container width).
  protected readonly VB_W = 280;
  protected readonly VB_H = 130;
  private readonly PLOT_TOP = 8;
  private readonly BASELINE = 100;

  protected dailyTotals = signal<DailyTotal[]>([]);
  protected hourly = signal<number[]>(new Array(24).fill(0));
  protected rhythm = signal<IntervalStats | null>(null);
  protected week = signal<WeekComparison | null>(null);
  protected feedsToday = signal<number>(0);
  protected avgFeedsPerDay = signal<number>(0);
  protected lastFeedMs = signal<number | null>(null);
  protected timeSinceText = signal<string | null>(null);
  protected intervalEnabled = signal<boolean>(false);

  // "Next feed" countdown, mirroring the Today page (reuses NotificationService).
  protected nextFeedCountdown = signal<string | null>(null);
  protected feedingStatusLabel = signal<string | null>(null);
  protected feedingStatusIcon = signal<string>('fa-clock');
  protected feedingStatusClass = signal<string>('');

  protected hasData = computed(
    () => this.lastFeedMs() !== null || this.dailyTotals().some(d => d.feeds > 0)
  );

  protected heatMax = computed(() => Math.max(1, ...this.hourly()));

  protected peakHour = computed(() => {
    const h = this.hourly();
    let idx = -1;
    let max = 0;
    h.forEach((c, i) => {
      if (c > max) {
        max = c;
        idx = i;
      }
    });
    return max > 0 ? idx : null;
  });

  // Two separate bar charts (each on its own axis/unit).
  protected milkChart = computed(() =>
    this.layoutBars(this.dailyTotals(), d => d.milkMl, v => `${v} ml`)
  );
  protected solidsChart = computed(() =>
    this.layoutBars(this.dailyTotals(), d => d.solidFeeds, v => `${v} solid feed${v === 1 ? '' : 's'}`)
  );
  protected hasSolidsData = computed(() => this.dailyTotals().some(d => d.solidFeeds > 0));

  /** Build bar geometry for one metric over the day series. */
  private layoutBars(days: DailyTotal[], value: (d: DailyTotal) => number, formatValue: (v: number) => string): BarChart {
    const maxVal = Math.max(1, ...days.map(value));
    const plotH = this.BASELINE - this.PLOT_TOP;
    const slotW = this.VB_W / (days.length || 1);
    const barW = Math.min(14, slotW - 6);
    const bars: Bar[] = days.map((d, i) => {
      const v = value(d);
      const height = v > 0 ? (v / maxVal) * plotH : 0;
      const x = i * slotW + (slotW - barW) / 2;
      return {
        x,
        y: this.BASELINE - height,
        height,
        label: d.label,
        showLabel: i % 2 === 1,
        title: `${d.weekday} ${d.label} — ${formatValue(v)}`
      };
    });
    return { maxVal, barW, bars };
  }

  constructor() {
    // React to settings (interval enable/disable) for the countdown row.
    effect(() => {
      this.settingsService.settings();
      this.intervalEnabled.set(this.settingsService.isFeedingIntervalEnabled());
      this.updateCountdown();
    });
  }

  ngOnInit(): void {
    this.feedingService.entries$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh());
    this.refresh();

    // Keep the live "time since" and countdown fresh.
    interval(60000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateTimeSince();
        this.updateCountdown();
      });
  }

  private refresh(): void {
    this.dailyTotals.set(this.feedingService.getDailyTotals(this.TREND_DAYS));
    this.hourly.set(this.feedingService.getHourlyCounts());
    this.rhythm.set(this.feedingService.getIntervalStats(7));
    this.week.set(this.feedingService.getWeekComparison());
    this.feedsToday.set(this.feedingService.getTodayEntries().length);
    this.avgFeedsPerDay.set(this.feedingService.getStatistics().averageFeedingsPerDay);

    const last = this.feedingService
      .getAllEntries()
      .reduce((max, e) => (e.timestamp > max ? e.timestamp : max), 0);
    this.lastFeedMs.set(last > 0 ? last : null);

    this.updateTimeSince();
    this.updateCountdown();
  }

  private updateTimeSince(): void {
    const last = this.lastFeedMs();
    this.timeSinceText.set(last ? this.formatDuration(Math.max(0, Date.now() - last)) : null);
  }

  private updateCountdown(): void {
    const timeUntil = this.notificationService.getTimeUntilNextNotification();
    if (timeUntil === null || !this.settingsService.isFeedingIntervalEnabled()) {
      this.nextFeedCountdown.set(null);
      this.feedingStatusLabel.set(null);
      return;
    }

    const totalMinutes = Math.floor(timeUntil / 1000 / 60);
    if (totalMinutes >= -10 && totalMinutes <= 10) {
      this.nextFeedCountdown.set('Feeding time');
      this.feedingStatusLabel.set('Status');
      this.feedingStatusIcon.set('fa-bell');
      this.feedingStatusClass.set('feeding-time');
    } else if (totalMinutes < -10) {
      this.nextFeedCountdown.set(this.formatDuration(Math.abs(timeUntil)));
      this.feedingStatusLabel.set('Overdue by');
      this.feedingStatusIcon.set('fa-triangle-exclamation');
      this.feedingStatusClass.set('overdue');
    } else {
      this.nextFeedCountdown.set(this.formatDuration(timeUntil));
      this.feedingStatusLabel.set('Next feed in');
      this.feedingStatusIcon.set('fa-clock');
      this.feedingStatusClass.set('');
    }
  }

  protected heatColor(count: number): string {
    if (count <= 0) return 'var(--bg-light)';
    const alpha = 0.1 + 0.9 * (count / this.heatMax());
    return `rgba(139, 92, 246, ${alpha.toFixed(3)})`;
  }

  protected formatDuration(ms: number): string {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  protected deltaIcon(delta: number): string {
    if (delta > 0) return 'fa-arrow-up';
    if (delta < 0) return 'fa-arrow-down';
    return 'fa-minus';
  }

  protected deltaClass(delta: number): string {
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
  }

  protected formatDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : `${delta}`;
  }
}
