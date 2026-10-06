import { TestBed, ComponentFixture } from '@angular/core/testing';
import { FeedingForm } from './feeding-form';
import { FeedingType } from '../../models/feeding-entry.model';

describe('FeedingForm', () => {
  let fixture: ComponentFixture<FeedingForm>;
  let form: FeedingForm;
  let emitted: Record<string, unknown>[];

  function create(type: FeedingType): void {
    fixture = TestBed.createComponent(FeedingForm);
    form = fixture.componentInstance;
    fixture.componentRef.setInput('feedingType', type);
    fixture.detectChanges();
    emitted = [];
    form.submitForm.subscribe((v) => emitted.push(v));
    form.feedingForm.patchValue({ datetime: '2026-10-06T08:30' });
  }

  describe('milk', () => {
    beforeEach(() => create('milk'));

    it('requires a positive amount', () => {
      expect(form.feedingForm.valid).toBe(false);
      form.feedingForm.patchValue({ amount: 0 });
      expect(form.feedingForm.valid).toBe(false);
      form.feedingForm.patchValue({ amount: 120 });
      expect(form.feedingForm.valid).toBe(true);
    });

    it('splits date/time and drops solid-only fields', () => {
      form.feedingForm.patchValue({ amount: 120 });
      form.onSubmit();
      expect(emitted[0]).toMatchObject({ date: '2026-10-06', time: '08:30', amount: 120 });
      expect(emitted[0]).not.toHaveProperty('name');
      expect(emitted[0]).not.toHaveProperty('spoons');
    });
  });

  describe('solid', () => {
    beforeEach(() => create('solid'));

    it('requires a name and grams by default', () => {
      form.feedingForm.patchValue({ amount: 50 });
      expect(form.feedingForm.valid).toBe(false);
      form.feedingForm.patchValue({ name: 'Banana' });
      expect(form.feedingForm.valid).toBe(true);
    });

    it('spoons mode requires spoons and submits amount 0', () => {
      form.feedingForm.patchValue({ name: 'Banana', amount: 50 });
      form.onMeasureTypeChange('spoons');
      expect(form.feedingForm.valid).toBe(false);

      form.feedingForm.patchValue({ spoons: 4 });
      form.onSubmit();
      expect(emitted[0]).toMatchObject({ name: 'Banana', amount: 0, spoons: 4 });
    });

    it('"not sure" needs only the name and clears both amounts', () => {
      form.feedingForm.patchValue({ name: 'Banana' });
      form.onMeasureTypeChange('none');
      expect(form.feedingForm.valid).toBe(true);

      form.onSubmit();
      expect(emitted[0]).toMatchObject({ name: 'Banana', amount: 0, spoons: null });
    });
  });

  it('prefills an existing spoons entry in spoons mode', () => {
    fixture = TestBed.createComponent(FeedingForm);
    fixture.componentRef.setInput('feedingType', 'solid');
    fixture.componentRef.setInput('entry', {
      id: '1',
      type: 'solid',
      date: '2026-10-05',
      time: '18:00',
      amount: 0,
      name: 'Pear',
      spoons: 3,
      timestamp: 0,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.isEditMode).toBe(true);
    expect(fixture.componentInstance.solidMeasureType).toBe('spoons');
    expect(fixture.componentInstance.feedingForm.value).toMatchObject({
      datetime: '2026-10-05T18:00',
      name: 'Pear',
      spoons: 3,
    });
  });
});
