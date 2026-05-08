import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AttachmentRecord, FormRecord } from './payee-search-dialog.component';
import { PayeeSearchDialogComponent } from './payee-search-dialog.component';
import { ReimbursementListDialogComponent, ReimbursementRecord } from './reimbursement-list-dialog.component';

interface FormState extends Omit<FormRecord, '_id'> {}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  readonly apiBaseUrl = '/api/forms';
  form = this.createEmptyForm();
  totalExpenses = '0.00';
  amountDue = '0.00';
  currentRecordId: string | null = null;
  selectedFiles: File[] = [];
  attachments: AttachmentRecord[] = [];
  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  get itemCountLabel(): string {
    return this.form.items.length === 1 ? '1 item' : `${this.form.items.length} items`;
  }

  get printItems(): Array<{ date: string; description: string; amount: number | null }> {
    return this.form.items.filter((item) => {
      const hasDate = Boolean(item.date && item.date.trim());
      const hasDescription = Boolean(item.description && item.description.trim());
      const hasAmount = item.amount !== null && item.amount !== undefined && `${item.amount}`.trim() !== '';
      return hasDate || hasDescription || hasAmount;
    });
  }

  constructor(
    private readonly http: HttpClient,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
  ) {}

  recalc(): void {
    const total = this.form.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const advance = Number(this.form.cash_advance) || 0;

    this.totalExpenses = total.toFixed(2);
    this.amountDue = (total - advance).toFixed(2);
  }

  saveData(): void {
    const validationError = this.validateRequiredFields();
    if (validationError) {
      this.showMessage(validationError);
      return;
    }

    this.recalc();

    if (!this.form.f_reqno || !this.form.f_reqno.trim()) {
      this.form.f_reqno = this.generateRequestNumber();
    }

    const base = this.createEmptyForm();
    const payload: FormState = {
      ...base,
      ...this.form,
      items: this.form.items.map((item) => ({
        date: item.date,
        description: item.description,
        amount: item.amount,
      })),
      total_expenses: this.totalExpenses,
      amount_due: this.amountDue,
    };

    const isUpdate = Boolean(this.currentRecordId);
    const request = this.currentRecordId
      ? this.http.put<FormRecord>(`${this.apiBaseUrl}/${this.currentRecordId}`, payload)
      : this.http.post<FormRecord>(this.apiBaseUrl, payload);

    request.subscribe({
      next: (savedRecord) => {
        this.form.f_reqno = savedRecord.f_reqno || this.form.f_reqno;
        this.currentRecordId = savedRecord._id ?? this.currentRecordId;
        this.attachments = Array.isArray(savedRecord.attachments) ? savedRecord.attachments : [];

        if (!this.currentRecordId || this.selectedFiles.length === 0) {
          this.showMessage(isUpdate ? 'Form updated.' : 'Form saved.');
          return;
        }

        this.uploadAttachments(this.currentRecordId, this.form.f_reqno, isUpdate);
      },
      error: () => this.showMessage('Failed to save form.'),
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const incomingFiles = input.files ? Array.from(input.files) : [];
    const mergedFiles = [...this.selectedFiles, ...incomingFiles];

    this.selectedFiles = mergedFiles.filter((file, index, allFiles) => {
      return allFiles.findIndex((candidate) => (
        candidate.name === file.name &&
        candidate.size === file.size &&
        candidate.lastModified === file.lastModified
      )) === index;
    });

    input.value = '';
  }

  clearSelectedFiles(fileInput: HTMLInputElement): void {
    this.selectedFiles = [];
    fileInput.value = '';
  }

  removeSelectedFile(index: number): void {
    if (index < 0 || index >= this.selectedFiles.length) {
      return;
    }
    this.selectedFiles = this.selectedFiles.filter((_, currentIndex) => currentIndex !== index);
  }

  getDownloadUrl(attachmentId: string): string {
    if (!this.currentRecordId) {
      return '#';
    }
    return `${this.apiBaseUrl}/${this.currentRecordId}/attachments/${attachmentId}/download`;
  }

  loadData(): void {
    const dialogRef = this.dialog.open(PayeeSearchDialogComponent, {
      width: '700px',
      data: {
        apiBaseUrl: this.apiBaseUrl,
        mode: 'load',
      },
    });

    dialogRef.afterClosed().subscribe((record) => {
      if (!record) {
        return;
      }
      this.populateForm(record);
      this.showMessage('Form loaded.');
    });
  }

  printForm(): void {
    this.recalc();
    setTimeout(() => window.print(), 100);
  }

  clearForm(): void {
    this.form = this.createEmptyForm();
    this.currentRecordId = null;
    this.selectedFiles = [];
    this.attachments = [];
    if (this.fileInputRef?.nativeElement) {
      this.fileInputRef.nativeElement.value = '';
    }
    this.recalc();
  }

  openList(): void {
    const dialogRef = this.dialog.open(ReimbursementListDialogComponent, {
      width: '900px',
      maxHeight: '80vh',
      data: { apiBaseUrl: this.apiBaseUrl },
    });

    dialogRef.afterClosed().subscribe((record) => {
      if (!record) {
        return;
      }
      this.populateForm(record);
      this.showMessage('Record loaded.');
    });
  }

  addItem(): void {
    this.form.items.push({ date: '', description: '', amount: null });
  }

  removeItem(): void {
    if (this.form.items.length <= 1) {
      return;
    }
    this.form.items.pop();
    this.recalc();
  }

  formatDate(value: string): string {
    if (!value) {
      return '';
    }
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) {
      return value;
    }
    return `${month}/${day}/${year}`;
  }

  formatMoney(value: number | string | null | undefined): string {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  }

  private populateForm(record: FormRecord): void {
    const existingItems = Array.isArray(record.items) ? record.items : [];
    const base = this.createEmptyForm();

    this.form = {
      ...base,
      f_date: record.f_date ?? base.f_date,
      f_reqno: record.f_reqno ?? base.f_reqno,
      f_purpose: record.f_purpose ?? base.f_purpose,
      c_evang: Boolean(record.c_evang),
      c_form: Boolean(record.c_form),
      c_church_donation: Boolean(record.c_church_donation ?? record.c_gov),
      c_miss: Boolean(record.c_miss),
      c_priest_stipend: Boolean(record.c_priest_stipend),
      c_bereavement: Boolean(record.c_bereavement),
      c_natl_remittance: Boolean(record.c_natl_remittance),
      c_other: Boolean(record.c_other),
      f_other_spec: record.f_other_spec ?? base.f_other_spec,
      f_payee: record.f_payee ?? base.f_payee,
      f_reqby: record.f_reqby ?? base.f_reqby,
      f_addr1: record.f_addr1 ?? base.f_addr1,
      f_city: record.f_city ?? base.f_city,
      f_state: record.f_state ?? base.f_state,
      f_zip: record.f_zip ?? base.f_zip,
      f_activity: record.f_activity ?? base.f_activity,
      f_location: record.f_location ?? base.f_location,
      cash_advance: record.cash_advance ?? null,
      approver1_name: record.approver1_name ?? base.approver1_name,
      approver1_date: record.approver1_date ?? base.approver1_date,
      approver2_name: record.approver2_name ?? base.approver2_name,
      approver2_date: record.approver2_date ?? base.approver2_date,
      acc_received: record.acc_received ?? base.acc_received,
      acc_check: record.acc_check ?? base.acc_check,
      acc_mailed: record.acc_mailed ?? base.acc_mailed,
      acc_remarks: record.acc_remarks ?? base.acc_remarks,
      items: existingItems.length > 0
        ? existingItems.map((item) => ({
            date: item?.date ?? '',
            description: item?.description ?? '',
            amount: item?.amount ?? null,
          }))
        : [{ date: '', description: '', amount: null }],
    };

    this.currentRecordId = record._id ?? null;
    this.attachments = Array.isArray(record.attachments) ? record.attachments : [];
    this.selectedFiles = [];

    this.recalc();
  }

  private createEmptyForm(): FormState {
    return {
      f_date: '',
      f_reqno: '',
      f_purpose: '',
      c_evang: false,
      c_form: false,
      c_church_donation: false,
      c_miss: false,
      c_priest_stipend: false,
      c_bereavement: false,
      c_natl_remittance: false,
      c_other: false,
      f_other_spec: '',
      f_payee: '',
      f_reqby: '',
      f_addr1: '',
      f_city: '',
      f_state: '',
      f_zip: '',
      f_activity: '',
      f_location: '',
      cash_advance: null,
      approver1_name: '',
      approver1_date: '',
      approver2_name: '',
      approver2_date: '',
      acc_received: '',
      acc_check: '',
      acc_mailed: '',
      acc_remarks: '',
      items: [{
        date: '',
        description: '',
        amount: null,
      }],
      total_expenses: '0.00',
      amount_due: '0.00',
    };
  }

  private showMessage(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 2200 });
  }

  private validateRequiredFields(): string | null {
    if (!this.form.f_date || !this.form.f_date.trim()) {
      return 'Date is required.';
    }

    if (!this.form.f_payee || !this.form.f_payee.trim()) {
      return 'Payee is required.';
    }

    if (!this.form.f_reqby || !this.form.f_reqby.trim()) {
      return 'Requested By is required.';
    }

    const hasChargeTo = Boolean(
      this.form.c_evang ||
      this.form.c_form ||
      this.form.c_church_donation ||
      this.form.c_miss ||
      this.form.c_priest_stipend ||
      this.form.c_bereavement ||
      this.form.c_natl_remittance ||
      this.form.c_other,
    );

    if (!hasChargeTo) {
      return 'Charge To is required.';
    }

    return null;
  }

  private generateRequestNumber(): string {
    const now = new Date();
    const yy = `${now.getFullYear()}`.slice(-2);
    const mm = `${now.getMonth() + 1}`.padStart(2, '0');
    const dd = `${now.getDate()}`.padStart(2, '0');
    const hh = `${now.getHours()}`.padStart(2, '0');
    const min = `${now.getMinutes()}`.padStart(2, '0');

    return `${yy}${mm}${dd}_${hh}${min}`;
  }

  private uploadAttachments(recordId: string, requestNumber: string, isUpdate: boolean): void {
    const formData = new FormData();

    this.selectedFiles.forEach((file) => {
      formData.append('files', file, file.name);
    });

    if (requestNumber) {
      formData.append('requestNumber', requestNumber);
    }

    this.http
      .post<{ attachments: AttachmentRecord[] }>(`${this.apiBaseUrl}/${recordId}/attachments`, formData)
      .subscribe({
        next: (response) => {
          this.attachments = Array.isArray(response.attachments) ? response.attachments : [];
          this.selectedFiles = [];
          this.showMessage(isUpdate ? 'Form updated with attachment(s).' : 'Form saved with attachment(s).');
        },
        error: () => {
          this.showMessage('Form saved, but failed to upload attachment(s).');
        },
      });
  }
}
