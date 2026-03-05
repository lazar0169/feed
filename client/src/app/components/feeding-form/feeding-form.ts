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
  solidMeasureType: 'grams' | 'spoons' = 'grams';

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
    const defaultDate = this.defaultDate || now.toISOString().split('T')[0];
    const defaultTime = this.formatTime(now);
    const isSolid = this.feedingType === 'solid';

    // Determine measure type for editing
    if (this.entry && isSolid) {
      this.solidMeasureType = this.entry.spoons ? 'spoons' : 'grams';
    } else {
      this.solidMeasureType = 'grams';
    }

    if (this.feedingForm) {
      // Update existing form
      this.feedingForm.patchValue({
        date: this.entry?.date || defaultDate,
        time: this.entry?.time || defaultTime,
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
        date: [this.entry?.date || defaultDate, Validators.required],
        time: [this.entry?.time || defaultTime, Validators.required],
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
      } else {
        this.feedingForm.get('spoons')?.setValidators([Validators.required, Validators.min(1)]);
      }
    } else {
      this.feedingForm.get('name')?.clearValidators();
      this.feedingForm.get('spoons')?.clearValidators();
      this.feedingForm.get('amount')?.setValidators([Validators.required, Validators.min(1)]);
    }
    this.feedingForm.get('name')?.updateValueAndValidity();
    this.feedingForm.get('amount')?.updateValueAndValidity();
    this.feedingForm.get('spoons')?.updateValueAndValidity();
  }

  onMeasureTypeChange(type: 'grams' | 'spoons'): void {
    this.solidMeasureType = type;
    // Clear the other field
    if (type === 'grams') {
      this.feedingForm.patchValue({ spoons: '' });
    } else {
      this.feedingForm.patchValue({ amount: '' });
    }
    this.updateSolidValidators(true);
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  onSubmit(): void {
    if (this.feedingForm.valid) {
      const formValue = { ...this.feedingForm.value };
      // Only include name and spoons for solid foods
      if (this.feedingType !== 'solid') {
        delete formValue.name;
        delete formValue.spoons;
      } else {
        // Clean up based on measure type
        if (this.solidMeasureType === 'grams') {
          delete formValue.spoons;
        } else {
          formValue.amount = 0; // Set amount to 0 when using spoons
        }
      }
      this.submitForm.emit(formValue);
      if (!this.isEditMode) {
        this.feedingForm.reset({
          date: this.feedingForm.value.date,
          time: this.formatTime(new Date()),
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
