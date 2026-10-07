import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { SleepKind, SleepSession, SleepSessionInput } from '../../models/sleep-session.model';

@Component({
  selector: 'app-sleep-form',
  imports: [ReactiveFormsModule],
  templateUrl: './sleep-form.html',
  styleUrl: './sleep-form.scss',
})
export class SleepForm implements OnInit, OnChanges {
  @Input() session?: SleepSession;
  @Input() defaultKind: SleepKind = 'nap';
  /** Whether "still asleep" is allowed (no other session is in progress). */
  @Input() allowOpenEnd = false;
  /** Error from the parent (e.g. overlap with another session). */
  @Input() error: string | null = null;
  @Output() submitForm = new EventEmitter<SleepSessionInput>();

  sleepForm!: FormGroup;
  isEditMode = false;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.sleepForm) return;
    if (changes['session']) {
      this.initForm();
    } else if (changes['allowOpenEnd']) {
      // The group validator reads allowOpenEnd, so re-run it.
      this.sleepForm.updateValueAndValidity();
    }
  }

  private initForm(): void {
    this.isEditMode = !!this.session;
    const now = Date.now();
    const stillAsleep = this.session?.endAt === null;
    const value = {
      kind: this.session?.kind ?? this.defaultKind,
      start: this.toLocalInput(this.session?.startAt ?? now - 60 * 60 * 1000),
      stillAsleep,
      end: stillAsleep ? '' : this.toLocalInput(this.session?.endAt ?? now),
      note: this.session?.note ?? '',
    };

    if (this.sleepForm) {
      this.sleepForm.reset(value);
    } else {
      this.sleepForm = this.fb.group(
        {
          kind: [value.kind, Validators.required],
          start: [value.start, Validators.required],
          stillAsleep: [value.stillAsleep],
          end: [value.end],
          note: [value.note],
        },
        { validators: (control) => this.validateRange(control) },
      );
    }
  }

  /** end after start, nothing in the future, "still asleep" only when allowed. */
  private validateRange(group: AbstractControl): ValidationErrors | null {
    const start = this.parseLocal(group.get('start')?.value);
    const end = this.parseLocal(group.get('end')?.value);
    // Small grace so "now" from a slightly stale form still validates.
    const latest = Date.now() + 60 * 1000;
    if (start === null) return null; // handled by required
    if (start > latest) return { futureStart: true };
    if (group.get('stillAsleep')?.value) return this.allowOpenEnd ? null : { openEndTaken: true };
    if (end === null) return { endRequired: true };
    if (end > latest) return { futureEnd: true };
    if (end <= start) return { endBeforeStart: true };
    return null;
  }

  get rangeError(): string | null {
    const errors = this.sleepForm.errors;
    if (!errors) return null;
    if (errors['futureStart']) return 'Start time is in the future.';
    if (errors['futureEnd']) return 'Wake-up time is in the future.';
    if (errors['endBeforeStart']) return 'Wake-up must be after falling asleep.';
    if (errors['endRequired']) return 'Add a wake-up time.';
    if (errors['openEndTaken']) return 'Another sleep is already in progress.';
    return null;
  }

  setKind(kind: SleepKind): void {
    this.sleepForm.patchValue({ kind });
  }

  /** Turning "still asleep" off needs a wake-up time to start from. */
  onStillAsleepChange(): void {
    const { stillAsleep, end } = this.sleepForm.value;
    if (!stillAsleep && !end) this.sleepForm.patchValue({ end: this.toLocalInput(Date.now()) });
  }

  onSubmit(): void {
    if (!this.sleepForm.valid) return;
    const raw = this.sleepForm.value;
    this.submitForm.emit({
      kind: raw.kind,
      startAt: this.parseLocal(raw.start)!,
      endAt: raw.stillAsleep ? null : this.parseLocal(raw.end),
      note: raw.note || undefined,
    });
  }

  /** epoch ms → 'YYYY-MM-DDTHH:mm' in local time for datetime-local inputs. */
  private toLocalInput(ms: number): string {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private parseLocal(value: string | null | undefined): number | null {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return isNaN(ms) ? null : ms;
  }
}
