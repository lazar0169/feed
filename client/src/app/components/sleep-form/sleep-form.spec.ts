import { TestBed, ComponentFixture } from '@angular/core/testing';
import { SleepForm } from './sleep-form';
import { SleepSessionInput } from '../../models/sleep-session.model';

const NOW = new Date(2026, 9, 6, 12, 0);

describe('SleepForm', () => {
  let fixture: ComponentFixture<SleepForm>;
  let form: SleepForm;

  beforeEach(() => {
    // Only fake Date so Angular's own timers keep working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    fixture = TestBed.createComponent(SleepForm);
    form = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('defaults to a valid one-hour session ending now', () => {
    const emitted: SleepSessionInput[] = [];
    form.submitForm.subscribe((v) => emitted.push(v));

    form.onSubmit();

    expect(emitted).toEqual([
      {
        kind: 'nap',
        startAt: NOW.getTime() - 60 * 60 * 1000,
        endAt: NOW.getTime(),
        note: undefined,
      },
    ]);
  });

  it('rejects a wake-up before falling asleep', () => {
    form.sleepForm.patchValue({ start: '2026-10-06T11:00', end: '2026-10-06T10:30' });
    expect(form.sleepForm.valid).toBe(false);
    expect(form.rangeError).toBe('Wake-up must be after falling asleep.');
  });

  it('rejects a start in the future', () => {
    form.sleepForm.patchValue({ start: '2026-10-06T13:00', end: '' });
    expect(form.rangeError).toBe('Start time is in the future.');
  });

  it('allows an empty end only when no other session is running', () => {
    form.sleepForm.patchValue({ end: '' });
    expect(form.rangeError).toBe('Add a wake-up time.');

    fixture.componentRef.setInput('allowOpenEnd', true);
    fixture.detectChanges();
    expect(form.sleepForm.valid).toBe(true);
  });

  it('prefills an in-progress session with an empty end', () => {
    fixture.componentRef.setInput('allowOpenEnd', true);
    fixture.componentRef.setInput('session', {
      id: 's',
      kind: 'night',
      startAt: new Date(2026, 9, 6, 1, 15).getTime(),
      endAt: null,
    });
    fixture.detectChanges();

    expect(form.isEditMode).toBe(true);
    expect(form.sleepForm.value).toMatchObject({
      kind: 'night',
      start: '2026-10-06T01:15',
      end: '',
    });
    expect(form.sleepForm.valid).toBe(true);
  });
});
