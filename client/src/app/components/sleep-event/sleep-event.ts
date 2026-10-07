import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SleepSession } from '../../models/sleep-session.model';
import { formatDuration } from '../../utils/duration';

/** A "fell asleep" or "woke up" row in the Sleep list, styled like a feeding row. */
@Component({
  selector: 'app-sleep-event',
  templateUrl: './sleep-event.html',
  styleUrl: './sleep-event.scss',
})
export class SleepEvent {
  @Input({ required: true }) session!: SleepSession;
  @Input({ required: true }) kind!: 'sleep-start' | 'sleep-end';
  @Output() editSession = new EventEmitter<SleepSession>();
  @Output() deleteSession = new EventEmitter<string>();

  isActive = false;

  get time(): string {
    const d = new Date(this.kind === 'sleep-start' ? this.session.startAt : this.session.endAt!);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  get sleptFor(): string | null {
    const { startAt, endAt } = this.session;
    return endAt === null ? null : formatDuration(endAt - startAt);
  }

  toggle(): void {
    this.isActive = !this.isActive;
  }

  onEdit(): void {
    this.isActive = false;
    this.editSession.emit(this.session);
  }

  onDelete(): void {
    if (confirm('Are you sure you want to delete this sleep?')) {
      this.isActive = false;
      this.deleteSession.emit(this.session.id);
    }
  }
}
