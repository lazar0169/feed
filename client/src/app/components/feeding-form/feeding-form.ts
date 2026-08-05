import { Component, EventEmitter, Input, OnInit, OnChanges, SimpleChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FeedingEntry, FeedingType } from '../../models/feeding-entry.model';

@Component({
  selector: 'app-feeding-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './feeding-form.html',
  styleUrl: './feeding-form.scss',
})
export class FeedingForm implements OnInit, OnChanges {
  @Input() entry?: FeedingEntry;
  @Input() feedingType: FeedingType | null = 'milk';
  @Input() defaultDate?: string;
  @Output() submitForm = new EventEmitter<{
    date: string;
    time: string;
    amount: number;
    name?: string;
    spoons?: number;
    comment?: string;
  }>();
  @Output() cancel = new EventEmitter<void>();

  feedingForm!: FormGroup;
  isEditMode = false;
  solidMeasureType: 'grams' | 'spoons' | 'none' = 'grams';

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['entry'] || changes['feedingType']) && this.feedingForm) {
      this.isEditMode = !!this.entry;
      this.initForm();
    }
  }

  private initForm(): void {
    this.isEditMode = !!this.entry;
    const now = new Date();
    const defaultDate = this.defaultDate || this.formatDate(now);
    // Combined value for the single <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
    const defaultDateTime = this.entry
      ? `${this.entry.date}T${this.entry.time}`
      : `${defaultDate}T${this.formatTime(now)}`;
    const isSolid = this.feedingType === 'solid';

    // Determine measure type for editing
    if (this.entry && isSolid) {
      if (this.entry.spoons) {
        this.solidMeasureType = 'spoons';
      } else if (this.entry.amount > 0) {
        this.solidMeasureType = 'grams';
      } else {
        this.solidMeasureType = 'none';
      }
    } else {
      this.solidMeasureType = 'grams';
    }

    if (this.feedingForm) {
      // Update existing form
      this.feedingForm.patchValue({
        datetime: defaultDateTime,
        amount: this.entry?.amount || '',
        name: this.entry?.name || '',
        spoons: this.entry?.spoons || '',
        comment: this.entry?.comment || ''
      });
      // Update validators based on type
      this.updateSolidValidators(isSolid);
    } else {
      // Create new form
      this.feedingForm = this.fb.group({
        datetime: [defaultDateTime, Validators.required],
        amount: [this.entry?.amount || '', isSolid ? [] : [Validators.required, Validators.min(1)]],
        name: [this.entry?.name || '', isSolid ? Validators.required : []],
        spoons: [this.entry?.spoons || ''],
        comment: [this.entry?.comment || '']
      });
      this.updateSolidValidators(isSolid);
    }
  }

  private updateSolidValidators(isSolid: boolean): void {
    if (isSolid) {
      this.feedingForm.get('name')?.setValidators([Validators.required]);
      // Amount and spoons validation handled by custom validator
      this.feedingForm.get('amount')?.clearValidators();
      this.feedingForm.get('spoons')?.clearValidators();
      if (this.solidMeasureType === 'grams') {
        this.feedingForm.get('amount')?.setValidators([Validators.required, Validators.min(1)]);
      } else if (this.solidMeasureType === 'spoons') {
        this.feedingForm.get('spoons')?.setValidators([Validators.required, Validators.min(1)]);
      }
      // 'none' → amount is unknown, only the food name is required
    } else {
      this.feedingForm.get('name')?.clearValidators();
      this.feedingForm.get('spoons')?.clearValidators();
      this.feedingForm.get('amount')?.setValidators([Validators.required, Validators.min(1)]);
    }
    this.feedingForm.get('name')?.updateValueAndValidity();
    this.feedingForm.get('amount')?.updateValueAndValidity();
    this.feedingForm.get('spoons')?.updateValueAndValidity();
  }

  onMeasureTypeChange(type: 'grams' | 'spoons' | 'none'): void {
    this.solidMeasureType = type;
    // Clear the fields that don't apply to the selected measure type
    if (type === 'grams') {
      this.feedingForm.patchValue({ spoons: '' });
    } else if (type === 'spoons') {
      this.feedingForm.patchValue({ amount: '' });
    } else {
      this.feedingForm.patchValue({ amount: '', spoons: '' });
    }
    this.updateSolidValidators(true);
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Split a datetime-local value ('YYYY-MM-DDTHH:mm') into [date, time]. */
  private splitDateTime(value: string): [string, string] {
    const [datePart = '', timePart = ''] = (value || '').split('T');
    return [datePart, timePart.slice(0, 5)];
  }

  onSubmit(): void {
    if (this.feedingForm.valid) {
      const raw = { ...this.feedingForm.value };
      // Split the combined datetime back into the date/time the rest of the
      // app (and DB columns) expect.
      const [date, time] = this.splitDateTime(raw.datetime);
      // Loosely typed (like the reactive form value) so we can clear fields
      // with null / delete depending on feeding type.
      const formValue: any = {
        date,
        time,
        amount: raw.amount,
        name: raw.name,
        spoons: raw.spoons,
        comment: raw.comment
      };
      // Only include name and spoons for solid foods
      if (this.feedingType !== 'solid') {
        delete formValue.name;
        delete formValue.spoons;
      } else {
        // Normalize the fields that don't apply to the chosen measure type.
        // Set them explicitly (rather than delete) so switching measure type
        // on an existing entry clears the previous value instead of keeping it.
        if (this.solidMeasureType === 'grams') {
          formValue.spoons = null;
        } else if (this.solidMeasureType === 'spoons') {
          formValue.amount = 0; // Amount is measured in spoons, not grams
        } else {
          // 'none' → feed happened but amount is unknown
          formValue.amount = 0;
          formValue.spoons = null;
        }
      }
      this.submitForm.emit(formValue);
      if (!this.isEditMode) {
        // Keep the entered date, refresh the time to now for the next entry.
        this.feedingForm.reset({
          datetime: `${date}T${this.formatTime(new Date())}`,
          amount: '',
          name: '',
          spoons: '',
          comment: ''
        });
      }
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onlyNumbers(event: KeyboardEvent): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    // Allow only numbers (0-9)
    if (charCode < 48 || charCode > 57) {
      event.preventDefault();
      return false;
    }
    return true;
  }
}
