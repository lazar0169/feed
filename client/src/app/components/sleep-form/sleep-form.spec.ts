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

  it('requires a wake-up time unless marked still asleep', () => {
    form.sleepForm.patchValue({ end: '' });
    expect(form.rangeError).toBe('Add a wake-up time.');

    fixture.componentRef.setInput('allowOpenEnd', true);
    form.sleepForm.patchValue({ stillAsleep: true });
    expect(form.sleepForm.valid).toBe(true);
  });

  it('rejects still asleep while another session is running', () => {
    form.sleepForm.patchValue({ stillAsleep: true });
    expect(form.rangeError).toBe('Another sleep is already in progress.');
  });

  it('emits an open end when still asleep, ignoring the end field', () => {
    const emitted: SleepSessionInput[] = [];
    form.submitForm.subscribe((v) => emitted.push(v));
    fixture.componentRef.setInput('allowOpenEnd', true);
    fixture.detectChanges();

    form.sleepForm.patchValue({ stillAsleep: true });
    form.onSubmit();

    expect(emitted[0].endAt).toBeNull();
  });

  it('opens an in-progress session with still asleep on and the end empty', () => {
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
      stillAsleep: true,
      end: '',
    });
    expect(form.sleepForm.valid).toBe(true);
    expect(fixture.nativeElement.querySelector('#sleep-end')).toBeNull();
  });

  it('fills the wake-up with now when still asleep is turned off', () => {
    form.sleepForm.patchValue({ stillAsleep: false, end: '' });
    form.onStillAsleepChange();
    expect(form.sleepForm.value.end).toBe('2026-10-06T12:00');
  });
});
