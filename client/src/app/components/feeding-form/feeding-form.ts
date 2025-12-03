import { Component, EventEmitter, Input, OnInit, OnChanges, SimpleChanges, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FeedingEntry } from '../../models/feeding-entry.model';

@Component({
  selector: 'app-feeding-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './feeding-form.html',
  styleUrl: './feeding-form.scss',
})
export class FeedingForm implements OnInit, OnChanges {
  @Input() entry?: FeedingEntry;
  @Input() defaultDate?: string;
  @Output() submitForm = new EventEmitter<{
    date: string;
    time: string;
    amount: number;
    comment?: string;
  }>();
  @Output() cancel = new EventEmitter<void>();

  feedingForm!: FormGroup;
  isEditMode = false;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entry'] && this.feedingForm) {
      this.isEditMode = !!this.entry;
      this.initForm();
    }
  }

  private initForm(): void {
    this.isEditMode = !!this.entry;
    const now = new Date();
    const defaultDate = this.defaultDate || now.toISOString().split('T')[0];
    const defaultTime = this.formatTime(now);

    if (this.feedingForm) {
      // Update existing form
      this.feedingForm.patchValue({
        date: this.entry?.date || defaultDate,
        time: this.entry?.time || defaultTime,
        amount: this.entry?.amount || '',
        comment: this.entry?.comment || ''
      });
    } else {
      // Create new form
      this.feedingForm = this.fb.group({
        date: [this.entry?.date || defaultDate, Validators.required],
        time: [this.entry?.time || defaultTime, Validators.required],
        amount: [this.entry?.amount || '', [Validators.required, Validators.min(1)]],
        comment: [this.entry?.comment || '']
      });
    }
  }

  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  onSubmit(): void {
    if (this.feedingForm.valid) {
      this.submitForm.emit(this.feedingForm.value);
      if (!this.isEditMode) {
        this.feedingForm.reset({
          date: this.feedingForm.value.date,
          time: this.formatTime(new Date()),
          amount: '',
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
